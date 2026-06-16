import { describe, it, expect } from 'vitest';
import { parseReportJson, isReportUsable, sectionsToMarkdown } from './parser';
import { estimateCostUsd } from './cost';
import { evaluateRateLimit, getRateLimitConfig } from './ratelimit';
import { generateReport, ReportGenerationError, type ReportLLM } from './pipeline';

describe('parseReportJson', () => {
  it('coerces a well-formed payload into typed sections', () => {
    const raw = JSON.stringify({
      summary: '  A chip company.  ',
      catalysts: ['New GPU', '', 'Data center demand'],
      bullCase: 'Growth',
      bearCase: 'Competition',
      valuation: 'Rich',
      risks: ['Cyclical'],
      sources: [{ title: 'IR', url: 'https://x.com' }, 'Bare title'],
    });
    const { sections, sources } = parseReportJson(raw);
    expect(sections.summary).toBe('A chip company.');
    expect(sections.catalysts).toEqual(['New GPU', 'Data center demand']); // empties dropped
    expect(sources).toEqual([{ title: 'IR', url: 'https://x.com' }, { title: 'Bare title' }]);
  });

  it('returns an empty report on invalid JSON without throwing', () => {
    const { sections, sources } = parseReportJson('not json');
    expect(sections.summary).toBe('');
    expect(sources).toEqual([]);
    expect(isReportUsable(sections)).toBe(false);
  });

  it('treats a report with only a summary as usable', () => {
    const { sections } = parseReportJson(JSON.stringify({ summary: 'hi' }));
    expect(isReportUsable(sections)).toBe(true);
  });
});

describe('sectionsToMarkdown', () => {
  it('always includes the not-financial-advice disclaimer', () => {
    const md = sectionsToMarkdown(
      'NVDA',
      { summary: 'S', catalysts: [], bullCase: '', bearCase: '', valuation: '', risks: [] },
      [],
    );
    expect(md).toContain('Not financial advice');
    expect(md).toContain('# NVDA');
  });
});

describe('estimateCostUsd', () => {
  it('computes cost from default per-MTok prices', () => {
    // 1M input @2.5 + 1M output @10 = 12.5
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBeCloseTo(12.5, 6);
    expect(estimateCostUsd(0, 0)).toBe(0);
  });
});

describe('evaluateRateLimit', () => {
  const config = getRateLimitConfig();

  it('allows under the caps', () => {
    expect(evaluateRateLimit({ user: 0, global: 0 }, config).allowed).toBe(true);
  });

  it('blocks the user when their daily cap is hit', () => {
    const d = evaluateRateLimit({ user: config.perUserPerDay, global: 0 }, config);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe('user');
  });

  it('blocks globally first when the global cap is hit', () => {
    const d = evaluateRateLimit({ user: 0, global: config.globalPerDay }, config);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe('global');
  });
});

describe('generateReport', () => {
  const okLLM: ReportLLM = {
    complete: async () => ({
      content: JSON.stringify({
        summary: 'NVIDIA designs GPUs.',
        catalysts: ['AI demand'],
        bullCase: 'Dominant',
        bearCase: 'Valuation',
        valuation: 'Premium multiple',
        risks: ['Cyclical demand'],
        sources: [{ title: 'IR', url: 'https://nvidia.com' }],
      }),
      promptTokens: 500,
      completionTokens: 400,
      totalTokens: 900,
    }),
  };

  it('produces a typed report with usage, cost, and freshness', async () => {
    const now = new Date('2026-06-16T00:00:00Z');
    const report = await generateReport({
      inputs: { symbol: 'NVDA', priceSummary: 'last $212', headlines: [{ title: 'Earnings beat' }] },
      llm: okLLM,
      model: 'test-model',
      now,
    });
    expect(report.symbol).toBe('NVDA');
    expect(report.model).toBe('test-model');
    expect(report.promptVersion).toBeGreaterThanOrEqual(1);
    expect(report.sections.summary).toContain('NVIDIA');
    expect(report.usage.totalTokens).toBe(900);
    expect(report.usage.costUsd).toBeGreaterThan(0);
    // fed-in headline merged into sources
    expect(report.sources.some((s) => s.title === 'Earnings beat')).toBe(true);
    // 24h freshness by default
    expect(new Date(report.expiresAt).getTime()).toBe(now.getTime() + 24 * 3600 * 1000);
  });

  it('throws ReportGenerationError on unusable output', async () => {
    const badLLM: ReportLLM = {
      complete: async () => ({ content: '{}', promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
    };
    await expect(
      generateReport({ inputs: { symbol: 'NVDA' }, llm: badLLM }),
    ).rejects.toBeInstanceOf(ReportGenerationError);
  });
});
