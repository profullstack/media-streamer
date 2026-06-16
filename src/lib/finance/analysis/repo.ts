/**
 * Finance — data access for AI reports + the run ledger (service-role).
 */

import { getServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/supabase';
import type { FinanceReport, FinanceReportSections, ReportSource } from './types';

const REPORTS_TABLE = 'finance_reports';
const RUNS_TABLE = 'finance_report_runs';

export interface StoredReport extends FinanceReport {
  expired: boolean;
}

/** Fetch the cached report for the cache key, or null. Marks freshness. */
export async function getCachedReport(
  symbol: string,
  model: string,
  promptVersion: number,
): Promise<StoredReport | null> {
  const { data } = await getServerClient()
    .from(REPORTS_TABLE)
    .select('*')
    .eq('symbol', symbol)
    .eq('model', model)
    .eq('prompt_version', promptVersion)
    .maybeSingle();

  if (!data) return null;

  return {
    symbol: data.symbol,
    model: data.model,
    promptVersion: data.prompt_version,
    sections: data.sections as unknown as FinanceReportSections,
    markdown: data.markdown,
    sources: (data.sources as unknown as ReportSource[]) ?? [],
    usage: {
      promptTokens: data.prompt_tokens,
      completionTokens: data.completion_tokens,
      totalTokens: data.total_tokens,
      costUsd: Number(data.cost_usd),
    },
    generatedAt: data.generated_at,
    expiresAt: data.expires_at,
    expired: new Date(data.expires_at).getTime() <= Date.now(),
  };
}

/** Upsert a freshly generated report (cache key = symbol+model+prompt_version). */
export async function saveReport(report: FinanceReport, generatedBy: string | null): Promise<void> {
  await getServerClient()
    .from(REPORTS_TABLE)
    .upsert(
      {
        symbol: report.symbol,
        model: report.model,
        prompt_version: report.promptVersion,
        sections: report.sections as unknown as Json,
        markdown: report.markdown,
        sources: report.sources as unknown as Json,
        prompt_tokens: report.usage.promptTokens,
        completion_tokens: report.usage.completionTokens,
        total_tokens: report.usage.totalTokens,
        cost_usd: report.usage.costUsd,
        generated_by: generatedBy,
        generated_at: report.generatedAt,
        expires_at: report.expiresAt,
      },
      { onConflict: 'symbol,model,prompt_version' },
    );
}

export interface RunLogEntry {
  profileId: string | null;
  symbol: string;
  model: string;
  promptVersion: number;
  status: 'success' | 'failure' | 'rate_limited';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  error?: string | null;
}

/** Append an audit/rate-limit ledger row. Never throws (best-effort). */
export async function logRun(entry: RunLogEntry): Promise<void> {
  try {
    await getServerClient()
      .from(RUNS_TABLE)
      .insert({
        profile_id: entry.profileId,
        symbol: entry.symbol,
        model: entry.model,
        prompt_version: entry.promptVersion,
        status: entry.status,
        prompt_tokens: entry.promptTokens ?? 0,
        completion_tokens: entry.completionTokens ?? 0,
        total_tokens: entry.totalTokens ?? 0,
        cost_usd: entry.costUsd ?? 0,
        error: entry.error ?? null,
      });
  } catch (error) {
    console.error('[finance/analysis] failed to log run (non-fatal):', error);
  }
}

/** Count successful generations since `sinceISO`, for one profile and globally. */
export async function countRunsSince(
  profileId: string,
  sinceISO: string,
): Promise<{ user: number; global: number }> {
  const supabase = getServerClient();

  const [{ count: userCount }, { count: globalCount }] = await Promise.all([
    supabase
      .from(RUNS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('status', 'success')
      .gte('created_at', sinceISO),
    supabase
      .from(RUNS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'success')
      .gte('created_at', sinceISO),
  ]);

  return { user: userCount ?? 0, global: globalCount ?? 0 };
}
