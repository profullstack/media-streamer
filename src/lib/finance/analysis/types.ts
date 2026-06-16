/**
 * Finance — AI report types (PRD §3.3).
 *
 * Reports are STRUCTURED (typed sections) so the client renders consistently
 * and the layout can evolve without breaking cached reports.
 */

export interface ReportSource {
  title: string;
  url?: string;
}

export interface FinanceReportSections {
  /** Business summary — what the company does. */
  summary: string;
  /** Recent catalysts / developments. */
  catalysts: string[];
  /** The constructive case. */
  bullCase: string;
  /** The skeptical case. */
  bearCase: string;
  /** Valuation framing (no price targets / advice). */
  valuation: string;
  /** Key risks. */
  risks: string[];
}

export interface ReportUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface FinanceReport {
  symbol: string;
  model: string;
  promptVersion: number;
  sections: FinanceReportSections;
  markdown: string;
  sources: ReportSource[];
  usage: ReportUsage;
  generatedAt: string;
  expiresAt: string;
}

/** Inputs gathered before building the prompt (PRD §3.3 pipeline). */
export interface ReportInputs {
  symbol: string;
  /** A short human-readable price-action summary, e.g. "last $102.00, -5.6% on the day…". */
  priceSummary?: string;
  /** Recent headlines from the news/RSS stack, where available. */
  headlines?: ReportSource[];
}
