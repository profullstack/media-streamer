-- IPTV Subscriptions Table
-- Stores ArgonTV IPTV subscription information for users

CREATE TABLE IF NOT EXISTS iptv_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    argontv_line_id INTEGER NOT NULL,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    m3u_download_link TEXT NOT NULL,
    package_key VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT iptv_subscriptions_status_check CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    CONSTRAINT iptv_subscriptions_package_key_check CHECK (package_key IN ('1_month', '3_months', '6_months', '12_months', '24_hour_test', '3_hour_test'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_iptv_subscriptions_user_id ON iptv_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_iptv_subscriptions_status ON iptv_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_iptv_subscriptions_expires_at ON iptv_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_iptv_subscriptions_argontv_line_id ON iptv_subscriptions(argontv_line_id);

-- Create unique constraint on argontv_line_id (one line per subscription)
CREATE UNIQUE INDEX IF NOT EXISTS idx_iptv_subscriptions_argontv_line_id_unique ON iptv_subscriptions(argontv_line_id);

-- Enable Row Level Security
ALTER TABLE iptv_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only view their own subscriptions
CREATE POLICY "Users can view own IPTV subscriptions"
    ON iptv_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (server-side operations)
CREATE POLICY "Service role can manage IPTV subscriptions"
    ON iptv_subscriptions
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_iptv_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_iptv_subscriptions_updated_at
    BEFORE UPDATE ON iptv_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_iptv_subscriptions_updated_at();

-- IPTV Payment History Table
-- Tracks payments specifically for IPTV subscriptions
CREATE TABLE IF NOT EXISTS iptv_payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    iptv_subscription_id UUID REFERENCES iptv_subscriptions(id) ON DELETE SET NULL,
    coinpayportal_payment_id VARCHAR(255) NOT NULL UNIQUE,
    amount_usd DECIMAL(10, 2) NOT NULL,
    amount_crypto VARCHAR(50),
    crypto_currency VARCHAR(20),
    blockchain VARCHAR(50),
    tx_hash VARCHAR(255),
    payment_address VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_type VARCHAR(50) NOT NULL DEFAULT 'new_subscription',
    package_key VARCHAR(50) NOT NULL,
    webhook_received_at TIMESTAMPTZ,
    webhook_event_type VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT iptv_payment_history_status_check CHECK (status IN ('pending', 'detected', 'confirmed', 'failed', 'expired')),
    CONSTRAINT iptv_payment_history_payment_type_check CHECK (payment_type IN ('new_subscription', 'extension')),
    CONSTRAINT iptv_payment_history_package_key_check CHECK (package_key IN ('1_month', '3_months', '6_months', '12_months', '24_hour_test', '3_hour_test'))
);

-- Create indexes for IPTV payment history
CREATE INDEX IF NOT EXISTS idx_iptv_payment_history_user_id ON iptv_payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_iptv_payment_history_subscription_id ON iptv_payment_history(iptv_subscription_id);
CREATE INDEX IF NOT EXISTS idx_iptv_payment_history_status ON iptv_payment_history(status);
CREATE INDEX IF NOT EXISTS idx_iptv_payment_history_coinpayportal_id ON iptv_payment_history(coinpayportal_payment_id);

-- Enable Row Level Security
ALTER TABLE iptv_payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment history
CREATE POLICY "Users can view own IPTV payment history"
    ON iptv_payment_history
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage IPTV payment history"
    ON iptv_payment_history
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Create updated_at trigger for payment history
CREATE TRIGGER trigger_iptv_payment_history_updated_at
    BEFORE UPDATE ON iptv_payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_iptv_subscriptions_updated_at();

-- Function to get user's active IPTV subscription
CREATE OR REPLACE FUNCTION get_active_iptv_subscription(p_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    argontv_line_id INTEGER,
    username VARCHAR(255),
    password VARCHAR(255),
    m3u_download_link TEXT,
    package_key VARCHAR(50),
    status VARCHAR(20),
    expires_at TIMESTAMPTZ,
    days_remaining INTEGER,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS subscription_id,
        s.argontv_line_id,
        s.username,
        s.password,
        s.m3u_download_link,
        s.package_key,
        s.status,
        s.expires_at,
        GREATEST(0, EXTRACT(DAY FROM (s.expires_at - NOW()))::INTEGER) AS days_remaining,
        (s.status = 'active' AND s.expires_at > NOW()) AS is_active
    FROM iptv_subscriptions s
    WHERE s.user_id = p_user_id
    ORDER BY s.expires_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_active_iptv_subscription(UUID) TO authenticated;

-- Comment on tables
COMMENT ON TABLE iptv_subscriptions IS 'Stores ArgonTV IPTV subscription information for users';
COMMENT ON TABLE iptv_payment_history IS 'Tracks payments for IPTV subscriptions via CoinPayPortal';
