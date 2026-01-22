-- DHT Crawler API Tables
-- This migration creates tables for API key management and usage tracking
-- for the DHT torrent search API service

-- ============================================
-- API KEYS TABLE
-- ============================================
-- Stores hashed API keys with tier-based limits
CREATE TABLE IF NOT EXISTS dht_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,        -- SHA256 of actual key
    key_prefix TEXT NOT NULL,             -- First 8 chars for identification
    name TEXT,                            -- Friendly name
    tier TEXT NOT NULL DEFAULT 'free',    -- free, basic, pro, enterprise

    -- Limits
    rate_limit_per_min INT DEFAULT 30,
    daily_limit INT DEFAULT 1000,
    monthly_limit INT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,

    -- Metadata
    owner_email TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_dht_api_keys_hash ON dht_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_dht_api_keys_prefix ON dht_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_dht_api_keys_tier ON dht_api_keys(tier);
CREATE INDEX IF NOT EXISTS idx_dht_api_keys_active ON dht_api_keys(is_active) WHERE is_active = true;

-- ============================================
-- USAGE LOGS TABLE
-- ============================================
-- Detailed per-request logging for analytics and debugging
CREATE TABLE IF NOT EXISTS dht_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES dht_api_keys(id) ON DELETE SET NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INT,
    response_time_ms INT,
    request_ip TEXT,
    user_agent TEXT,
    query_params JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for usage queries
CREATE INDEX IF NOT EXISTS idx_dht_usage_logs_key_date ON dht_usage_logs(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dht_usage_logs_created_at ON dht_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dht_usage_logs_endpoint ON dht_usage_logs(endpoint);

-- Partition by month for better performance (optional, can be added later)
-- For now, we'll use time-based pruning via cron

-- ============================================
-- USAGE DAILY TABLE
-- ============================================
-- Daily aggregates for billing and quota enforcement
CREATE TABLE IF NOT EXISTS dht_usage_daily (
    api_key_id UUID REFERENCES dht_api_keys(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    request_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    avg_response_ms INT,
    bandwidth_bytes BIGINT DEFAULT 0,
    PRIMARY KEY (api_key_id, date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_dht_usage_daily_date ON dht_usage_daily(date);

-- ============================================
-- RATE LIMIT BUCKETS TABLE
-- ============================================
-- Sliding window rate limit tracking
CREATE TABLE IF NOT EXISTS dht_rate_limits (
    api_key_id UUID REFERENCES dht_api_keys(id) ON DELETE CASCADE PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to increment daily usage
CREATE OR REPLACE FUNCTION dht_increment_daily_usage(
    p_api_key_id UUID,
    p_response_time_ms INT,
    p_is_error BOOLEAN DEFAULT false
) RETURNS void AS $$
BEGIN
    INSERT INTO dht_usage_daily (api_key_id, date, request_count, error_count, avg_response_ms)
    VALUES (p_api_key_id, CURRENT_DATE, 1, CASE WHEN p_is_error THEN 1 ELSE 0 END, p_response_time_ms)
    ON CONFLICT (api_key_id, date) DO UPDATE SET
        request_count = dht_usage_daily.request_count + 1,
        error_count = dht_usage_daily.error_count + CASE WHEN p_is_error THEN 1 ELSE 0 END,
        avg_response_ms = (dht_usage_daily.avg_response_ms * dht_usage_daily.request_count + p_response_time_ms)
                          / (dht_usage_daily.request_count + 1);
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit (returns true if allowed)
CREATE OR REPLACE FUNCTION dht_check_rate_limit(
    p_api_key_id UUID,
    p_limit_per_min INT
) RETURNS BOOLEAN AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_request_count INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Get current rate limit state
    SELECT window_start, request_count INTO v_window_start, v_request_count
    FROM dht_rate_limits WHERE api_key_id = p_api_key_id;

    -- If no record or window expired, reset
    IF v_window_start IS NULL OR v_window_start < v_now - INTERVAL '1 minute' THEN
        INSERT INTO dht_rate_limits (api_key_id, window_start, request_count, updated_at)
        VALUES (p_api_key_id, v_now, 1, v_now)
        ON CONFLICT (api_key_id) DO UPDATE SET
            window_start = v_now,
            request_count = 1,
            updated_at = v_now;
        RETURN true;
    END IF;

    -- Check if under limit
    IF v_request_count < p_limit_per_min THEN
        UPDATE dht_rate_limits
        SET request_count = request_count + 1, updated_at = v_now
        WHERE api_key_id = p_api_key_id;
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to get today's usage for a key
CREATE OR REPLACE FUNCTION dht_get_daily_usage(p_api_key_id UUID)
RETURNS INT AS $$
    SELECT COALESCE(request_count, 0)
    FROM dht_usage_daily
    WHERE api_key_id = p_api_key_id AND date = CURRENT_DATE;
$$ LANGUAGE sql STABLE;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update last_used_at on API key when used
CREATE OR REPLACE FUNCTION dht_update_key_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dht_api_keys SET last_used_at = NOW() WHERE id = NEW.api_key_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dht_usage_logs_update_key
    AFTER INSERT ON dht_usage_logs
    FOR EACH ROW
    EXECUTE FUNCTION dht_update_key_last_used();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
-- Enable RLS but allow service role full access
ALTER TABLE dht_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE dht_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dht_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE dht_rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by the API server)
CREATE POLICY "Service role full access to dht_api_keys" ON dht_api_keys
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to dht_usage_logs" ON dht_usage_logs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to dht_usage_daily" ON dht_usage_daily
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to dht_rate_limits" ON dht_rate_limits
    FOR ALL USING (true) WITH CHECK (true);
