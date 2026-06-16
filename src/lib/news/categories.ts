/**
 * News categories — shared between the news API route and UI.
 *
 * Lives here (not in the route file) because Next.js route modules may only
 * export Route handlers / config; a non-handler export like this fails the
 * webpack production build's route type validation.
 */

// Supported categories from TheNewsAPI
export const NEWS_CATEGORIES = [
  'general',
  'science',
  'sports',
  'business',
  'health',
  'entertainment',
  'tech',
  'politics',
  'food',
  'travel',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
