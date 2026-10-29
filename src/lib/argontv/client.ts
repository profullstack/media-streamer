/**
 * ArgonTV API Client
 *
 * The IPTV reseller API, spoken by @profullstack/stream-providers' ArgonTV
 * adapter (shared with tipoffwatch, genrewatch, watchnews and ch4nnels). This
 * class keeps the raw response shapes the rest of the app reads.
 *
 * Checked against the live API 2026-10-29: it authenticates with `X-ApiKey` (a
 * bearer is refused), the line route is `/api/v1/lines/:id`, and the host is
 * distributors.argontv.nl (api.argontv.nl has no DNS record).
 */

import { createReseller, RESELLER_BASE_URL } from '@profullstack/stream-providers/argontv';
import type { Reseller } from '@profullstack/stream-providers/argontv';
import type {
  ArgonTVConfig,
  CreateLineRequest,
  CreateLineResponse,
  ExtendLineRequest,
  ExtendLineResponse,
  GetLineResponse,
  GetTemplatesResponse,
} from './types';

export class ArgonTVClient {
  private reseller: Reseller;

  constructor(config: ArgonTVConfig) {
    this.reseller = createReseller({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || RESELLER_BASE_URL,
    });
  }

  /**
   * Create a new IPTV line
   *
   * @param params - Line creation parameters
   * @returns Created line details including credentials and M3U link
   */
  async createLine(params: CreateLineRequest): Promise<CreateLineResponse> {
    const payload: Record<string, unknown> = {
      package: params.package,
    };

    if (params.username) {
      payload.username = params.username;
    }
    if (params.password) {
      payload.password = params.password;
    }
    if (params.template !== undefined) {
      payload.template = params.template;
    }
    if (params.allowed_live) {
      payload.allowed_live = params.allowed_live;
    }
    if (params.allowed_vod) {
      payload.allowed_vod = params.allowed_vod;
    }
    if (params.allowed_series) {
      payload.allowed_series = params.allowed_series;
    }
    if (params.additional_cons !== undefined) {
      payload.additional_cons = params.additional_cons;
    }

    return this.reseller.call('create-line', { method: 'POST', body: payload });
  }

  /**
   * Extend existing IPTV lines
   *
   * @param params - Extension parameters including line IDs and package
   * @returns Extension result with success/failure counts
   */
  async extendLine(params: ExtendLineRequest): Promise<ExtendLineResponse> {
    return this.reseller.call('extend', {
      method: 'POST',
      body: { lines: params.lines, package: params.package },
    });
  }

  /**
   * Get line details by ID
   *
   * @param lineId - The line ID to retrieve
   * @returns Line details including status and credentials
   */
  async getLine(lineId: number): Promise<GetLineResponse> {
    return this.reseller.call(`lines/${Number(lineId)}`);
  }

  /**
   * Get available templates
   *
   * @returns List of available templates
   */
  async getTemplates(): Promise<GetTemplatesResponse> {
    return this.reseller.call('templates');
  }
}

// Singleton instance
let client: ArgonTVClient | null = null;

/**
 * Get the ArgonTV client singleton
 *
 * @returns ArgonTV client instance
 * @throws Error if IPTV_ARGON_API_KEY is not set
 */
export function getArgonTVClient(): ArgonTVClient {
  if (!client) {
    const apiKey = process.env.IPTV_ARGON_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Missing ArgonTV configuration. Please set IPTV_ARGON_API_KEY environment variable.'
      );
    }

    client = new ArgonTVClient({
      apiKey,
      baseUrl: process.env.IPTV_ARGON_API_BASE_URL,
    });
  }

  return client;
}

/**
 * Reset the client singleton (for testing)
 */
export function resetArgonTVClient(): void {
  client = null;
}
