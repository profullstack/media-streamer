/**
 * Finance — "Opportunities" AI stock-screen types.
 *
 * A user supplies free-text parameters (e.g. "top 10 stocks under $10 with
 * decent 6-12 month potential") and the model returns a STRUCTURED, ranked
 * candidate list so the client renders consistently and each ticker links into
 * the existing ticker page. This is idea generation, NOT financial advice.
 */

import type { ReportUsage } from '../analysis/types';

export interface OpportunityStock {
  /** Ticker symbol, normalized upper-case (links to /finance/ticker/:symbol). */
  symbol: string;
  /** Company / ETF name, when known. */
  name?: string;
  /** 1-3 sentence rationale for why it fits the requested parameters. */
  thesis: string;
  /** Optional near-term catalysts. */
  catalysts?: string;
  /** Optional key risk to be aware of. */
  risk?: string;
  /** Optional approximate price context, e.g. "trades around $7". */
  priceContext?: string;
}

export interface OpportunityList {
  /** The effective prompt used (default or user-supplied). */
  prompt: string;
  /** Short framing paragraph for the list. */
  intro: string;
  /** Ranked candidate stocks. */
  stocks: OpportunityStock[];
  /** Always-present not-financial-advice disclaimer. */
  disclaimer: string;
  /** Copyable markdown rendering of the list. */
  markdown: string;
  model: string;
  promptVersion: number;
  usage: ReportUsage;
  generatedAt: string;
}
