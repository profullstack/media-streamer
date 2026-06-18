/**
 * Finance — Opportunities (AI stock screen) module public surface.
 */

export * from './types';
export {
  OPPORTUNITIES_PROMPT_VERSION,
  DEFAULT_OPPORTUNITIES_PROMPT,
  MAX_PROMPT_LENGTH,
} from './prompt';
export { generateOpportunities, type GenerateOpportunitiesOptions } from './pipeline';
export {
  parseOpportunitiesJson,
  isOpportunitiesUsable,
  opportunitiesToMarkdown,
  type ParsedOpportunities,
} from './parser';
