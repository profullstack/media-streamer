/**
 * Finance — AI analysis module public surface.
 */

export * from './types';
export { PROMPT_VERSION } from './prompt';
export { estimateCostUsd } from './cost';
export {
  generateReport,
  getReportModel,
  getFreshnessHours,
  createOpenAIReportLLM,
  ReportGenerationError,
  type ReportLLM,
  type LLMCompletion,
} from './pipeline';
export {
  getRateLimitConfig,
  evaluateRateLimit,
  rollingWindowStart,
  type RateLimitDecision,
} from './ratelimit';
export {
  getCachedReport,
  saveReport,
  logRun,
  countRunsSince,
  type StoredReport,
} from './repo';
export { parseReportJson, sectionsToMarkdown, isReportUsable } from './parser';
export { buildReportInputs, buildPriceSummary } from './inputs';
