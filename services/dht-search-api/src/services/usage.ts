import { createHash } from 'crypto';
import { getDb } from './db';
import type { ApiKey, DbApiKey, ApiTier } from '../types';

// Hash API key for storage/lookup
export function hashApiKey(key: string): string {
  const salt = process.env.API_KEY_SALT || 'default-salt-change-me';
  return createHash('sha256').update(key + salt).digest('hex');
}

// Validate API key and return key info
export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const db = getDb();
  const keyHash = hashApiKey(key);

  const { data, error } = await db
    .from('dht_api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  const dbKey = data as DbApiKey;

  // Check if expired
  if (dbKey.expires_at && new Date(dbKey.expires_at) < new Date()) {
    return null;
  }

  return {
    id: dbKey.id,
    key_prefix: dbKey.key_prefix,
    name: dbKey.name,
    tier: dbKey.tier as ApiTier,
    rate_limit_per_min: dbKey.rate_limit_per_min,
    daily_limit: dbKey.daily_limit,
    monthly_limit: dbKey.monthly_limit,
    is_active: dbKey.is_active,
    created_at: dbKey.created_at,
    expires_at: dbKey.expires_at,
    last_used_at: dbKey.last_used_at,
  };
}

// Check and update rate limit
export async function checkRateLimit(apiKey: ApiKey): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}> {
  const db = getDb();

  // Use database function for atomic rate limit check
  const { data, error } = await db.rpc('dht_check_rate_limit', {
    p_api_key_id: apiKey.id,
    p_limit_per_min: apiKey.rate_limit_per_min,
  });

  if (error) {
    console.error('Rate limit check error:', error);
    // Allow on error to avoid blocking all requests
    return { allowed: true, remaining: apiKey.rate_limit_per_min, resetAt: new Date() };
  }

  const allowed = data === true;
  const resetAt = new Date(Date.now() + 60000); // 1 minute from now

  // Get current count for remaining calculation
  const { data: limitData } = await db
    .from('dht_rate_limits')
    .select('request_count')
    .eq('api_key_id', apiKey.id)
    .single();

  const currentCount = limitData?.request_count || 0;
  const remaining = Math.max(0, apiKey.rate_limit_per_min - currentCount);

  return { allowed, remaining, resetAt };
}

// Check daily quota
export async function checkDailyQuota(apiKey: ApiKey): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const db = getDb();

  const { data, error } = await db.rpc('dht_get_daily_usage', {
    p_api_key_id: apiKey.id,
  });

  if (error) {
    console.error('Daily quota check error:', error);
    return { allowed: true, used: 0, limit: apiKey.daily_limit };
  }

  const used = data || 0;
  const allowed = used < apiKey.daily_limit;

  return { allowed, used, limit: apiKey.daily_limit };
}

// Log API request
export async function logRequest(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  requestIp: string,
  userAgent: string,
  queryParams?: Record<string, unknown>
): Promise<void> {
  const db = getDb();

  // Insert into usage_logs
  await db.from('dht_usage_logs').insert({
    api_key_id: apiKeyId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    request_ip: requestIp,
    user_agent: userAgent,
    query_params: queryParams,
  });

  // Update daily aggregates
  const isError = statusCode >= 400;
  await db.rpc('dht_increment_daily_usage', {
    p_api_key_id: apiKeyId,
    p_response_time_ms: responseTimeMs,
    p_is_error: isError,
  });
}

// Get API key usage info for /me endpoint
export async function getApiKeyInfo(
  apiKey: ApiKey
): Promise<{
  key_id: string;
  tier: ApiTier;
  requests_today: number;
  requests_limit: number;
  rate_limit: string;
  created_at: string;
  expires_at: string | null;
}> {
  const db = getDb();

  const { data } = await db.rpc('dht_get_daily_usage', {
    p_api_key_id: apiKey.id,
  });

  return {
    key_id: apiKey.key_prefix,
    tier: apiKey.tier,
    requests_today: data || 0,
    requests_limit: apiKey.daily_limit,
    rate_limit: `${apiKey.rate_limit_per_min}/min`,
    created_at: apiKey.created_at,
    expires_at: apiKey.expires_at,
  };
}
