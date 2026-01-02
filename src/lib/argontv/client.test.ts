/**
 * ArgonTV Client Tests
 * 
 * Tests for ArgonTV IPTV reseller API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ArgonTVClient,
  getArgonTVClient,
  resetArgonTVClient,
} from './client';
import { ARGONTV_PACKAGES } from './types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ArgonTVClient', () => {
  const testConfig = {
    apiKey: 'test-api-key-12345',
    baseUrl: 'https://api.argontv.nl',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetArgonTVClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with provided config', () => {
      const client = new ArgonTVClient(testConfig);
      expect(client).toBeInstanceOf(ArgonTVClient);
    });

    it('should use default base URL if not provided', () => {
      const client = new ArgonTVClient({ apiKey: 'test-key' });
      expect(client).toBeInstanceOf(ArgonTVClient);
    });
  });

  describe('createLine', () => {
    it('should create a new IPTV line with package ID', async () => {
      const mockResponse = {
        error: false,
        id: 3559,
        creation_time: 1700242788,
        expiration_time: 1700329188,
        username: '125950677866',
        password: '204437619472',
        xtream_codes_username: '125950677866',
        xtream_codes_password: '204437619472',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.createLine({
        package: ARGONTV_PACKAGES['1_month'],
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.argontv.nl/api/v1/create-line',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key-12345',
          }),
          body: JSON.stringify({
            package: ARGONTV_PACKAGES['1_month'],
          }),
        })
      );
    });

    it('should create line with custom username and password', async () => {
      const mockResponse = {
        error: false,
        id: 3560,
        creation_time: 1700242788,
        expiration_time: 1700329188,
        username: 'customuser',
        password: 'custompass123',
        xtream_codes_username: 'customuser',
        xtream_codes_password: 'custompass123',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=customuser&password=custompass123&output=ts&type=m3u_plus',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.createLine({
        package: ARGONTV_PACKAGES['3_months'],
        username: 'customuser',
        password: 'custompass123',
      });

      expect(result.username).toBe('customuser');
      expect(result.password).toBe('custompass123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.argontv.nl/api/v1/create-line',
        expect.objectContaining({
          body: JSON.stringify({
            package: ARGONTV_PACKAGES['3_months'],
            username: 'customuser',
            password: 'custompass123',
          }),
        })
      );
    });

    it('should create line with template', async () => {
      const mockResponse = {
        error: false,
        id: 3561,
        creation_time: 1700242788,
        expiration_time: 1700329188,
        username: '125950677867',
        password: '204437619473',
        xtream_codes_username: '125950677867',
        xtream_codes_password: '204437619473',
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677867&password=204437619473&output=ts&type=m3u_plus',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.createLine({
        package: ARGONTV_PACKAGES['12_months'],
        template: 12345,
      });

      expect(result.error).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.argontv.nl/api/v1/create-line',
        expect.objectContaining({
          body: JSON.stringify({
            package: ARGONTV_PACKAGES['12_months'],
            template: 12345,
          }),
        })
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: true, message: 'Invalid API key' }),
      });

      const client = new ArgonTVClient(testConfig);
      
      await expect(client.createLine({
        package: ARGONTV_PACKAGES['1_month'],
      })).rejects.toThrow('ArgonTV API error: 401 - Invalid API key');
    });

    it('should throw error on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: true, message: 'Insufficient credits' }),
      });

      const client = new ArgonTVClient(testConfig);
      
      await expect(client.createLine({
        package: ARGONTV_PACKAGES['1_month'],
      })).rejects.toThrow('ArgonTV API error: Insufficient credits');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new ArgonTVClient(testConfig);
      
      await expect(client.createLine({
        package: ARGONTV_PACKAGES['1_month'],
      })).rejects.toThrow('Network error');
    });
  });

  describe('extendLine', () => {
    it('should extend existing lines', async () => {
      const mockResponse = {
        error: false,
        failed: 0,
        successful: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.extendLine({
        lines: [3559],
        package: ARGONTV_PACKAGES['1_month'],
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.argontv.nl/api/v1/extend',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            lines: [3559],
            package: ARGONTV_PACKAGES['1_month'],
          }),
        })
      );
    });

    it('should extend multiple lines at once', async () => {
      const mockResponse = {
        error: false,
        failed: 0,
        successful: 3,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.extendLine({
        lines: [3559, 3560, 3561],
        package: ARGONTV_PACKAGES['3_months'],
      });

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      const mockResponse = {
        error: false,
        failed: 1,
        successful: 2,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.extendLine({
        lines: [3559, 3560, 9999],
        package: ARGONTV_PACKAGES['1_month'],
      });

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: true, message: 'Invalid line ID' }),
      });

      const client = new ArgonTVClient(testConfig);
      
      await expect(client.extendLine({
        lines: [9999],
        package: ARGONTV_PACKAGES['1_month'],
      })).rejects.toThrow('ArgonTV API error: 400 - Invalid line ID');
    });
  });

  describe('getLine', () => {
    it('should get line details by ID', async () => {
      const mockResponse = {
        error: false,
        id: 3559,
        username: '125950677866',
        password: '204437619472',
        status: 'active',
        creation_time: 1700242788,
        expiration_time: 1700329188,
        max_connections: 2,
        m3u_download_link: 'https://line.ottc.xyz/get.php?username=125950677866&password=204437619472&output=ts&type=m3u_plus',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.getLine(3559);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.argontv.nl/api/v1/line/3559',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should throw error for non-existent line', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: true, message: 'Line not found' }),
      });

      const client = new ArgonTVClient(testConfig);
      
      await expect(client.getLine(99999)).rejects.toThrow('ArgonTV API error: 404 - Line not found');
    });
  });

  describe('getTemplates', () => {
    it('should get available templates', async () => {
      const mockResponse = {
        error: false,
        templates: [
          { id: 1, name: 'Basic' },
          { id: 2, name: 'Everything' },
          { id: 3, name: 'Sports Only' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const client = new ArgonTVClient(testConfig);
      const result = await client.getTemplates();

      expect(result.templates).toHaveLength(3);
      expect(result.templates[1].name).toBe('Everything');
    });
  });
});

describe('getArgonTVClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetArgonTVClient();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetArgonTVClient();
  });

  it('should create singleton client from environment variables', () => {
    process.env.IPTV_ARGON_API_KEY = 'env-api-key';
    process.env.IPTV_ARGON_API_BASE_URL = 'https://custom.argontv.nl';

    const client1 = getArgonTVClient();
    const client2 = getArgonTVClient();

    expect(client1).toBe(client2);
    expect(client1).toBeInstanceOf(ArgonTVClient);
  });

  it('should throw error if API key is missing', () => {
    delete process.env.IPTV_ARGON_API_KEY;

    expect(() => getArgonTVClient()).toThrow(
      'Missing ArgonTV configuration. Please set IPTV_ARGON_API_KEY environment variable.'
    );
  });

  it('should use default URL if not provided', () => {
    process.env.IPTV_ARGON_API_KEY = 'env-api-key';
    delete process.env.IPTV_ARGON_API_BASE_URL;

    const client = getArgonTVClient();
    expect(client).toBeInstanceOf(ArgonTVClient);
  });
});

describe('resetArgonTVClient', () => {
  beforeEach(() => {
    resetArgonTVClient();
  });

  it('should reset the singleton client', () => {
    process.env.IPTV_ARGON_API_KEY = 'test-key-1';
    const client1 = getArgonTVClient();
    
    resetArgonTVClient();
    
    process.env.IPTV_ARGON_API_KEY = 'test-key-2';
    const client2 = getArgonTVClient();

    expect(client1).not.toBe(client2);
  });
});
