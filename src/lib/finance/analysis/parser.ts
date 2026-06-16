/**
 * Finance — defensive parser for the LLM's JSON output, plus a markdown
 * renderer. The model can return partial/odd shapes; we coerce to a stable
 * typed report and never throw on missing fields (PRD §3.3, §6).
 */

import type { FinanceReportSections, ReportSource } from './types';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    // Allow a single string to degrade gracefully into a one-item list.
    const single = asString(value);
    return single ? [single] : [];
  }
  return value.map(asString).filter((s) => s.length > 0);
}

function asSources(value: unknown): ReportSource[] {
  if (!Array.isArray(value)) return [];
  const out: ReportSource[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const title = item.trim();
      if (title) out.push({ title });
      continue;
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const title = asString(rec.title) || asString(rec.name) || asString(rec.url);
      const url = asString(rec.url);
      if (title) out.push(url ? { title, url } : { title });
    }
  }
  return out;
}

export interface ParsedReport {
  sections: FinanceReportSections;
  sources: ReportSource[];
}

/** Parse raw LLM content (expected JSON) into typed sections + sources. */
export function parseReportJson(raw: string): ParsedReport {
  let obj: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
  } catch {
    // Fall back to an all-empty report; the route decides whether that's usable.
  }

  return {
    sections: {
      summary: asString(obj.summary),
      catalysts: asStringArray(obj.catalysts),
      bullCase: asString(obj.bullCase),
      bearCase: asString(obj.bearCase),
      valuation: asString(obj.valuation),
      risks: asStringArray(obj.risks),
    },
    sources: asSources(obj.sources),
  };
}

/** A report is usable if it has at least a summary or one of the cases. */
export function isReportUsable(sections: FinanceReportSections): boolean {
  return Boolean(sections.summary || sections.bullCase || sections.bearCase);
}

const DISCLAIMER =
  '_Not financial advice. Informational/entertainment only — we are not a registered investment adviser._';

/** Render the structured sections to copyable markdown (stored alongside JSON). */
export function sectionsToMarkdown(
  symbol: string,
  sections: FinanceReportSections,
  sources: ReportSource[],
): string {
  const parts: string[] = [`# ${symbol} — Research Narrative`, '', DISCLAIMER, ''];

  if (sections.summary) parts.push('## Summary', '', sections.summary, '');
  if (sections.catalysts.length) {
    parts.push('## Recent Catalysts', '', ...sections.catalysts.map((c) => `- ${c}`), '');
  }
  if (sections.bullCase) parts.push('## Bull Case', '', sections.bullCase, '');
  if (sections.bearCase) parts.push('## Bear Case', '', sections.bearCase, '');
  if (sections.valuation) parts.push('## Valuation', '', sections.valuation, '');
  if (sections.risks.length) {
    parts.push('## Risks', '', ...sections.risks.map((r) => `- ${r}`), '');
  }
  if (sources.length) {
    parts.push(
      '## Sources',
      '',
      ...sources.map((s) => (s.url ? `- [${s.title}](${s.url})` : `- ${s.title}`)),
      '',
    );
  }

  return parts.join('\n').trim();
}
