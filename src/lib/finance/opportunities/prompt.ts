/**
 * Finance — versioned prompt for the AI "Opportunities" stock screen.
 *
 * Bump OPPORTUNITIES_PROMPT_VERSION whenever the template or output contract
 * changes (it is logged to the run ledger alongside reports).
 */

export const OPPORTUNITIES_PROMPT_VERSION = 1;

/** Default screen shown in the prompt box when the user hasn't typed one. */
export const DEFAULT_OPPORTUNITIES_PROMPT =
  'Give me the top 10 stocks that are under $10 and have decent potential over the next 6-12 months.';

/** Hard upper bound on user prompt length (defensive). */
export const MAX_PROMPT_LENGTH = 600;

/**
 * Completion budget. gpt-5.x reasoning models spend hidden reasoning tokens out
 * of this same budget before emitting output, and a ~10-item list with a thesis
 * each runs long — so we give generous headroom (cf. the report token-budget fix).
 */
export const MAX_COMPLETION_TOKENS = 5000;

export const SYSTEM_PROMPT = `You are an equity research idea-generation assistant. The user gives you screening parameters and you return a ranked list of publicly traded stock or ETF candidates that fit.

STRICT RULES:
- This is NOT financial advice and NOT a recommendation to buy, sell, or hold. Do not give price targets or position sizing.
- Only return REAL, currently-listed tickers you are confident exist. Never invent symbols.
- You do not have live market data; treat any price-based parameter (e.g. "under $10") as approximate based on your general knowledge, and say so in "priceContext" when relevant. Do not fabricate precise current prices.
- Be balanced and specific: each pick needs a genuine, concrete thesis AND a real risk. Avoid generic filler.
- Honor the requested count and constraints as closely as you can; if you cannot find enough that fit, return fewer rather than padding with poor fits.

Respond with STRICT JSON only (no markdown, no prose outside JSON) matching exactly this shape:
{
  "intro": string,            // 1-2 sentence framing of the list and the parameters applied
  "stocks": [
    {
      "symbol": string,        // ticker, e.g. "PLTR"
      "name": string,          // company / ETF name
      "thesis": string,        // 1-3 sentences: why it fits the parameters
      "catalysts": string,     // optional near-term catalysts ("" if none)
      "risk": string,          // the key risk to be aware of
      "priceContext": string   // approximate price framing ("" if not relevant)
    }
  ],
  "disclaimer": string         // a brief not-financial-advice note
}`;

export function buildUserPrompt(userPrompt: string): string {
  return [
    'Generate the stock idea list for these parameters:',
    '',
    userPrompt,
    '',
    'Return the JSON object described in the system prompt.',
  ].join('\n');
}
