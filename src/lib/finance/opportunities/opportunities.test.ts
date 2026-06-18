import { describe, it, expect } from 'vitest';
import {
  parseOpportunitiesJson,
  isOpportunitiesUsable,
  opportunitiesToMarkdown,
} from './parser';
import { generateOpportunities } from './pipeline';
import { ReportGenerationError, type ReportLLM } from '../analysis/pipeline';

describe('parseOpportunitiesJson', () => {
  it('coerces a well-formed payload, normalizing and de-duping symbols', () => {
    const raw = JSON.stringify({
      intro: '  Some cheap names.  ',
      stocks: [
        { symbol: 'pltr', name: 'Palantir', thesis: 'Gov AI demand.', risk: 'Valuation.', priceContext: '~$25' },
        { symbol: 'PLTR', name: 'dupe', thesis: 'dupe' }, // duplicate symbol dropped
        { symbol: 'SOFI', thesis: 'Bank charter leverage.', catalysts: 'Rate cuts' },
        { symbol: 'BADTHESIS' }, // no thesis -> dropped
        { thesis: 'no symbol' }, // no symbol -> dropped
      ],
      disclaimer: 'Not advice.',
    });
    const parsed = parseOpportunitiesJson(raw);
    expect(parsed.intro).toBe('Some cheap names.');
    expect(parsed.stocks.map((s) => s.symbol)).toEqual(['PLTR', 'SOFI']);
    expect(parsed.stocks[0].priceContext).toBe('~$25');
    expect(parsed.stocks[1].catalysts).toBe('Rate cuts');
    expect(parsed.disclaimer).toBe('Not advice.');
  });

  it('returns an empty, unusable list on invalid JSON with a default disclaimer', () => {
    const parsed = parseOpportunitiesJson('not json');
    expect(parsed.stocks).toEqual([]);
    expect(isOpportunitiesUsable(parsed)).toBe(false);
    expect(parsed.disclaimer).toContain('Not financial advice');
  });
});

describe('opportunitiesToMarkdown', () => {
  it('renders ranked picks and the disclaimer', () => {
    const parsed = parseOpportunitiesJson(
      JSON.stringify({ intro: 'Hi', stocks: [{ symbol: 'F', name: 'Ford', thesis: 'Cheap.' }], disclaimer: 'NFA.' }),
    );
    const md = opportunitiesToMarkdown('under $10', parsed);
    expect(md).toContain('# Stock Opportunities');
    expect(md).toContain('_Parameters: under $10_');
    expect(md).toContain('## 1. F — Ford');
    expect(md).toContain('NFA.');
  });
});

describe('generateOpportunities', () => {
  const okLLM: ReportLLM = {
    complete: async () => ({
      content: JSON.stringify({
        intro: 'Cheap small caps.',
        stocks: [{ symbol: 'SOFI', name: 'SoFi', thesis: 'Bank charter.', risk: 'Credit cycle.' }],
        disclaimer: 'NFA.',
      }),
      promptTokens: 120,
      completionTokens: 800,
      totalTokens: 920,
    }),
  };

  it('produces a typed list with usage, cost, and the effective prompt', async () => {
    const now = new Date('2026-06-18T00:00:00Z');
    const result = await generateOpportunities({ prompt: 'under $10', llm: okLLM, model: 'test-model', now });
    expect(result.prompt).toBe('under $10');
    expect(result.model).toBe('test-model');
    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0].symbol).toBe('SOFI');
    expect(result.usage.totalTokens).toBe(920);
    expect(result.usage.costUsd).toBeGreaterThan(0);
    expect(result.markdown).toContain('SOFI');
  });

  it('throws when the model returns no usable ideas', async () => {
    const badLLM: ReportLLM = {
      complete: async () => ({ content: '{"stocks":[]}', promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
    };
    await expect(
      generateOpportunities({ prompt: 'x', llm: badLLM, model: 'm' }),
    ).rejects.toBeInstanceOf(ReportGenerationError);
  });

  it('flags a truncated (length) completion distinctly', async () => {
    const truncated: ReportLLM = {
      complete: async () => ({ content: '{"stocks":[', promptTokens: 1, completionTokens: 5000, totalTokens: 5001, finishReason: 'length' }),
    };
    await expect(
      generateOpportunities({ prompt: 'x', llm: truncated, model: 'm' }),
    ).rejects.toThrow(/truncated/i);
  });
});
