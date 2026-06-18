/**
 * Finance AI "Opportunities" stock screen (token-spending route).
 *
 * POST /api/finance/opportunities { prompt? } — generate a ranked candidate
 * list from free-text parameters. Enforces auth + active paid subscription
 * FIRST, then the shared per-user/global daily caps (same rolling-24h ledger as
 * reports) before any LLM call. Logs tokens + cost to the run ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscription/guard';
import { getActiveProfileId } from '@/lib/profiles/profile-utils';
import {
  countRunsSince,
  createOpenAIReportLLM,
  evaluateRateLimit,
  getRateLimitConfig,
  getReportModel,
  logRun,
  rollingWindowStart,
} from '@/lib/finance/analysis';
import {
  DEFAULT_OPPORTUNITIES_PROMPT,
  MAX_PROMPT_LENGTH,
  OPPORTUNITIES_PROMPT_VERSION,
  generateOpportunities,
} from '@/lib/finance/opportunities';

export const dynamic = 'force-dynamic';

/** Sentinel `symbol` for ledger rows so opportunities share the report cap. */
const LEDGER_SYMBOL = '*OPPORTUNITIES*';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireActiveSubscription(request);
  if (gate) return gate;

  const profileId = await getActiveProfileId();
  if (!profileId) {
    return NextResponse.json({ error: 'No active profile' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = (typeof body?.prompt === 'string' ? body.prompt.trim() : '').slice(0, MAX_PROMPT_LENGTH)
    || DEFAULT_OPPORTUNITIES_PROMPT;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  const model = getReportModel();

  // Rate limit (rolling 24h) — shared with reports; defends against LLM spend.
  const config = getRateLimitConfig();
  const counts = await countRunsSince(profileId, rollingWindowStart());
  const decision = evaluateRateLimit(counts, config);
  if (!decision.allowed) {
    await logRun({
      profileId,
      symbol: LEDGER_SYMBOL,
      model,
      promptVersion: OPPORTUNITIES_PROMPT_VERSION,
      status: 'rate_limited',
    });
    return NextResponse.json(
      { error: 'rate_limited', message: decision.reason, scope: decision.scope },
      { status: 429 },
    );
  }

  try {
    const llm = createOpenAIReportLLM(apiKey);
    const result = await generateOpportunities({ prompt, llm, model });

    await logRun({
      profileId,
      symbol: LEDGER_SYMBOL,
      model,
      promptVersion: OPPORTUNITIES_PROMPT_VERSION,
      status: 'success',
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: result.usage.costUsd,
    });

    return NextResponse.json({ opportunities: result });
  } catch (error) {
    console.error('[finance/opportunities] generation failed:', error);
    await logRun({
      profileId,
      symbol: LEDGER_SYMBOL,
      model,
      promptVersion: OPPORTUNITIES_PROMPT_VERSION,
      status: 'failure',
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 });
  }
}
