/**
 * ArgonTV API Client
 * 
 * Client library for ArgonTV IPTV reseller API integration
 */

import type {
  ArgonTVConfig,
  CreateLineRequest,
  CreateLineResponse,
  ExtendLineRequest,
  ExtendLineResponse,
  GetLineResponse,
  GetTemplatesResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://api.argontv.nl';

export class ArgonTVClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ArgonTVConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Parse response body
    const data = await response.json().catch(() => ({})) as { error?: boolean; message?: string };

    // Handle HTTP errors
    if (!response.ok) {
      const errorMessage = data.message || response.statusText;
      throw new Error(
        `ArgonTV API error: ${response.status} - ${errorMessage}`
      );
    }

    // Handle API-level errors (error: true with 200 status)
    if (data.error === true && data.message) {
      throw new Error(`ArgonTV API error: ${data.message}`);
    }

    return data as T;
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

    return this.request<CreateLineResponse>('/api/v1/create-line', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Extend existing IPTV lines
   * 
   * @param params - Extension parameters including line IDs and package
   * @returns Extension result with success/failure counts
   */
  async extendLine(params: ExtendLineRequest): Promise<ExtendLineResponse> {
    return this.request<ExtendLineResponse>('/api/v1/extend', {
      method: 'POST',
      body: JSON.stringify({
        lines: params.lines,
        package: params.package,
      }),
    });
  }

  /**
   * Get line details by ID
   * 
   * @param lineId - The line ID to retrieve
   * @returns Line details including status and credentials
   */
  async getLine(lineId: number): Promise<GetLineResponse> {
    return this.request<GetLineResponse>(`/api/v1/line/${lineId}`, {
      method: 'GET',
    });
  }

  /**
   * Get available templates
   * 
   * @returns List of available templates
   */
  async getTemplates(): Promise<GetTemplatesResponse> {
    return this.request<GetTemplatesResponse>('/api/v1/templates', {
      method: 'GET',
    });
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
