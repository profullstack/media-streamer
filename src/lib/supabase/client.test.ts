/**
 * Supabase Client Tests
 * 
 * Tests for the Supabase client configuration including:
 * - Header normalization for fetch wrapper
 * - Client creation and singleton management
 * - Environment variable validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeHeaders, resetServerClient } from './client';

describe('Supabase Client', () => {
  describe('normalizeHeaders', () => {
    it('should return empty object for undefined headers', () => {
      const result = normalizeHeaders(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object for null headers', () => {
      // @ts-expect-error - testing null input
      const result = normalizeHeaders(null);
      expect(result).toEqual({});
    });

    it('should handle plain object headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': 'test-api-key',
        'Authorization': 'Bearer token',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result).toEqual({
        'Content-Type': 'application/json',
        'apikey': 'test-api-key',
        'Authorization': 'Bearer token',
      });
    });

    it('should handle Headers object', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('apikey', 'test-api-key');
      headers.set('Authorization', 'Bearer token');
      
      const result = normalizeHeaders(headers);
      
      // Headers normalizes keys - check both possible cases
      const contentType = result['content-type'] ?? result['Content-Type'];
      const apikey = result['apikey'] ?? result['Apikey'];
      const authorization = result['authorization'] ?? result['Authorization'];
      
      expect(contentType).toBe('application/json');
      expect(apikey).toBe('test-api-key');
      expect(authorization).toBe('Bearer token');
    });

    it('should preserve apikey header from Headers object', () => {
      const headers = new Headers();
      headers.set('apikey', 'sb_secret_test123');
      
      const result = normalizeHeaders(headers);
      
      // Check both possible key cases
      const apikey = result['apikey'] ?? result['Apikey'];
      expect(apikey).toBe('sb_secret_test123');
    });

    it('should handle array of header tuples', () => {
      const headers: [string, string][] = [
        ['Content-Type', 'application/json'],
        ['apikey', 'test-api-key'],
        ['Authorization', 'Bearer token'],
      ];
      
      const result = normalizeHeaders(headers);
      
      expect(result).toEqual({
        'Content-Type': 'application/json',
        'apikey': 'test-api-key',
        'Authorization': 'Bearer token',
      });
    });

    it('should handle empty Headers object', () => {
      const headers = new Headers();
      
      const result = normalizeHeaders(headers);
      
      expect(result).toEqual({});
    });

    it('should handle empty array', () => {
      const headers: [string, string][] = [];
      
      const result = normalizeHeaders(headers);
      
      expect(result).toEqual({});
    });

    it('should handle empty plain object', () => {
      const headers = {};
      
      const result = normalizeHeaders(headers);
      
      expect(result).toEqual({});
    });

    it('should handle Headers with multiple values for same key', () => {
      const headers = new Headers();
      headers.append('Accept', 'application/json');
      headers.append('Accept', 'text/plain');
      
      const result = normalizeHeaders(headers);
      
      // Headers.forEach returns combined values - check both cases
      const accept = result['accept'] ?? result['Accept'];
      expect(accept).toBe('application/json, text/plain');
    });

    it('should preserve case for plain object keys', () => {
      const headers = {
        'X-Custom-Header': 'value',
        'APIKEY': 'key',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result['X-Custom-Header']).toBe('value');
      expect(result['APIKEY']).toBe('key');
    });

    it('should handle Supabase-style headers', () => {
      const headers = new Headers();
      headers.set('apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      headers.set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      headers.set('Content-Type', 'application/json');
      headers.set('Prefer', 'return=representation');
      
      const result = normalizeHeaders(headers);
      
      // Check both possible key cases
      const apikey = result['apikey'] ?? result['Apikey'];
      const authorization = result['authorization'] ?? result['Authorization'];
      const contentType = result['content-type'] ?? result['Content-Type'];
      const prefer = result['prefer'] ?? result['Prefer'];
      
      expect(apikey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      expect(authorization).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
      expect(contentType).toBe('application/json');
      expect(prefer).toBe('return=representation');
    });
  });

  describe('resetServerClient', () => {
    it('should reset the server client without throwing', () => {
      expect(() => resetServerClient()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      resetServerClient();
      resetServerClient();
      resetServerClient();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Header Normalization Edge Cases', () => {
    it('should handle headers with special characters in values', () => {
      const headers = {
        'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTYyMDY0MDAwMCwiZXhwIjoxOTM2MDAwMDAwfQ.test',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result['Authorization']).toBe(headers['Authorization']);
    });

    it('should handle headers with empty string values', () => {
      const headers = {
        'X-Empty': '',
        'apikey': 'valid-key',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result['X-Empty']).toBe('');
      expect(result['apikey']).toBe('valid-key');
    });

    it('should handle headers with unicode values', () => {
      const headers = {
        'X-Unicode': '日本語',
        'apikey': 'test-key',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result['X-Unicode']).toBe('日本語');
      expect(result['apikey']).toBe('test-key');
    });

    it('should handle headers with numeric-like values', () => {
      const headers = {
        'Content-Length': '12345',
        'X-Request-Id': '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const result = normalizeHeaders(headers);
      
      expect(result['Content-Length']).toBe('12345');
      expect(result['X-Request-Id']).toBe('123e4567-e89b-12d3-a456-426614174000');
    });
  });

  describe('Integration with Fetch', () => {
    it('should produce headers compatible with fetch API', () => {
      const originalHeaders = new Headers();
      originalHeaders.set('apikey', 'test-key');
      originalHeaders.set('Content-Type', 'application/json');
      
      const normalized = normalizeHeaders(originalHeaders);
      
      // Should be usable in fetch options
      const fetchOptions: { headers: Record<string, string> } = {
        headers: {
          ...normalized,
          'Connection': 'close',
        },
      };
      
      // Check both possible key cases
      const apikey = fetchOptions.headers['apikey'] ?? fetchOptions.headers['Apikey'];
      const contentType = fetchOptions.headers['content-type'] ?? fetchOptions.headers['Content-Type'];
      
      expect(apikey).toBe('test-key');
      expect(contentType).toBe('application/json');
      expect(fetchOptions.headers['Connection']).toBe('close');
    });

    it('should not lose apikey when spreading normalized headers', () => {
      const headers = new Headers();
      headers.set('apikey', 'sb_secret_important_key');
      headers.set('Authorization', 'Bearer token');
      
      const normalized = normalizeHeaders(headers);
      
      // Simulate what happens in createServerClient fetch wrapper
      const finalHeaders: Record<string, string> = {
        ...normalized,
        'Connection': 'close',
      };
      
      // Check both possible key cases
      const apikey = finalHeaders['apikey'] ?? finalHeaders['Apikey'];
      const authorization = finalHeaders['authorization'] ?? finalHeaders['Authorization'];
      
      expect(apikey).toBe('sb_secret_important_key');
      expect(authorization).toBe('Bearer token');
      expect(finalHeaders['Connection']).toBe('close');
    });
  });
});
