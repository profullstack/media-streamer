/**
 * Finance AI report (PRD §3.3, §5) — the ONLY token-spending route.
 *
 * GET  /api/finance/report?symbol=        — return the cached report (200 with
 *                                            `stale` flag) or 404 if none.
 * POST /api/finance/report {symbol,refresh}— generate/refresh. Enforces auth +
 *                                            active paid subscription FIRST, then
 *                                            per-user/global daily caps, before
 *                                            any upstream/LLM call. Logs tokens +
 *                                            cost to the run ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import { getMarketDataProvider } from '@/lib/finance/market-data';
import { normalizeSymbol } from '@/lib/finance/market-data/stooq';
import {
  PROMPT_VERSION,
  buildReportInputs,
  countRunsSince,
  createOpenAIReportLLM,
  evaluateRateLimit,
  generateReport,
  getCachedReport,
  getRateLimitConfig,
  getReportModel,
  logRun,
  rollingWindowStart,
  saveReport,
} from '@/lib/finance/analysis';

export const dynamic = 'force-dynamic';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function validSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const symbol = normalizeSymbol(raw);
  return SYMBOL_RE.test(symbol) ? symbol : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const symbol = validSymbol(request.nextUrl.searchParams.get('symbol'));
  if (!symbol) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const cached = await getCachedReport(symbol, getReportModel(), PROMPT_VERSION);
  if (!cached) {
    return NextResponse.json({ error: 'no report' }, { status: 404 });
  }

  return NextResponse.json({ report: cached, stale: cached.expired });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { symbol?: string; refresh?: boolean } | null;
  const symbol = validSymbol(body?.symbol ?? null);
  if (!symbol) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 });
  }

  const model = getReportModel();
  const refresh = body?.refresh === true;

  // Serve fresh cache without spending tokens unless an explicit refresh.
  const cached = await getCachedReport(symbol, model, PROMPT_VERSION);
  if (cached && !cached.expired && !refresh) {
    return NextResponse.json({ report: cached, cached: true });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  // Rate limit (rolling 24h) — defense against runaway LLM spend.
  const config = getRateLimitConfig();
  const counts = await countRunsSince(profileId, rollingWindowStart());
  const decision = evaluateRateLimit(counts, config);
  if (!decision.allowed) {
    await logRun({ profileId, symbol, model, promptVersion: PROMPT_VERSION, status: 'rate_limited' });
    return NextResponse.json({ error: 'rate_limited', message: decision.reason, scope: decision.scope }, { status: 429 });
  }

  try {
    // Gather inputs (price action) — render defensively if market data is thin.
    const provider = getMarketDataProvider();
    const [quote, candles] = await Promise.all([
      provider.getQuote(symbol).catch(() => null),
      provider.getCandles(symbol, '6M').catch(() => []),
    ]);

    const inputs = buildReportInputs({ symbol, quote, candles });
    const llm = createOpenAIReportLLM(apiKey);
    const report = await generateReport({ inputs, llm, model });

    await saveReport(report, profileId);
    await logRun({
      profileId,
      symbol,
      model,
      promptVersion: PROMPT_VERSION,
      status: 'success',
      promptTokens: report.usage.promptTokens,
      completionTokens: report.usage.completionTokens,
      totalTokens: report.usage.totalTokens,
      costUsd: report.usage.costUsd,
    });

    return NextResponse.json({ report, cached: false });
  } catch (error) {
    console.error('[finance/report] generation failed:', error);
    await logRun({
      profileId,
      symbol,
      model,
      promptVersion: PROMPT_VERSION,
      status: 'failure',
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
}
