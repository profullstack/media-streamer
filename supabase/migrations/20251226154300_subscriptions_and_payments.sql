-- Subscriptions and Payment History Schema
-- This migration adds tables for tracking user subscriptions and payment history
-- Required for crypto payments where recurring billing is not possible

-- ============================================
-- USER SUBSCRIPTIONS TABLE
-- ============================================
-- Tracks the current subscription state for each user
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    
    -- Subscription tier: trial, premium, or family
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('trial', 'premium', 'family')) DEFAULT 'trial',
    
    -- Subscription status
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')) DEFAULT 'active',
    
    -- Trial tracking
    trial_started_at TIMESTAMPTZ,
    trial_expires_at TIMESTAMPTZ,
    
    -- Paid subscription tracking
    subscription_started_at TIMESTAMPTZ,
    subscription_expires_at TIMESTAMPTZ,
    
    -- Renewal notification tracking
    renewal_reminder_sent_at TIMESTAMPTZ,
    renewal_reminder_7d_sent BOOLEAN DEFAULT FALSE,
    renewal_reminder_3d_sent BOOLEAN DEFAULT FALSE,
    renewal_reminder_1d_sent BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_subscriptions
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_tier ON user_subscriptions(tier);
CREATE INDEX idx_user_subscriptions_expires ON user_subscriptions(subscription_expires_at);
-- Index for finding subscriptions that need renewal reminders
CREATE INDEX idx_user_subscriptions_renewal_check ON user_subscriptions(subscription_expires_at, status) 
    WHERE status = 'active' AND tier IN ('premium', 'family');

-- Trigger for updated_at
CREATE TRIGGER update_user_subscriptions_updated_at
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PAYMENT HISTORY TABLE
-- ============================================
-- Records all payment transactions from CoinPayPortal
CREATE TABLE payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- CoinPayPortal payment reference
    coinpayportal_payment_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Payment details
    amount_usd DECIMAL(10, 2) NOT NULL,
    amount_crypto VARCHAR(50),
    crypto_currency VARCHAR(20),
    blockchain VARCHAR(20),
    
    -- Transaction details
    tx_hash VARCHAR(255),
    payment_address VARCHAR(255),
    
    -- Payment status from CoinPayPortal
    -- pending, detected, confirmed, forwarding, forwarded, failed, expired
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    
    -- What the payment was for
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('premium', 'family')),
    duration_months INTEGER NOT NULL DEFAULT 12,
    
    -- Subscription period this payment covers
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    
    -- Webhook tracking
    webhook_received_at TIMESTAMPTZ,
    webhook_event_type VARCHAR(50),
    
    -- Metadata from CoinPayPortal
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for payment_history
CREATE INDEX idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX idx_payment_history_coinpayportal_id ON payment_history(coinpayportal_payment_id);
CREATE INDEX idx_payment_history_status ON payment_history(status);
CREATE INDEX idx_payment_history_created_at ON payment_history(created_at DESC);
CREATE INDEX idx_payment_history_user_created ON payment_history(user_id, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_payment_history_updated_at
    BEFORE UPDATE ON payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- User subscriptions policies
CREATE POLICY "Users can view their own subscription"
    ON user_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all subscriptions (for webhook processing)
CREATE POLICY "Service role can manage subscriptions"
    ON user_subscriptions FOR ALL
    USING (auth.role() = 'service_role');

-- Payment history policies
CREATE POLICY "Users can view their own payment history"
    ON payment_history FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage all payments (for webhook processing)
CREATE POLICY "Service role can manage payments"
    ON payment_history FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to create a trial subscription for a new user
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_subscriptions (
        user_id,
        tier,
        status,
        trial_started_at,
        trial_expires_at
    ) VALUES (
        NEW.id,
        'trial',
        'active',
        NOW(),
        NOW() + INTERVAL '3 days'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create trial subscription when user signs up
CREATE TRIGGER on_auth_user_created_subscription
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_trial_subscription();

-- Function to get subscription status with computed fields
CREATE OR REPLACE FUNCTION get_subscription_status(p_user_id UUID)
RETURNS TABLE (
    subscription_id UUID,
    tier VARCHAR(20),
    status VARCHAR(20),
    is_active BOOLEAN,
    days_remaining INTEGER,
    expires_at TIMESTAMPTZ,
    needs_renewal BOOLEAN
) AS $$
DECLARE
    v_sub RECORD;
    v_expires TIMESTAMPTZ;
    v_is_active BOOLEAN;
    v_days_remaining INTEGER;
BEGIN
    SELECT * INTO v_sub FROM user_subscriptions WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Determine expiry date based on tier
    IF v_sub.tier = 'trial' THEN
        v_expires := v_sub.trial_expires_at;
    ELSE
        v_expires := v_sub.subscription_expires_at;
    END IF;
    
    -- Calculate if active
    v_is_active := v_sub.status = 'active' AND v_expires > NOW();
    
    -- Calculate days remaining
    IF v_expires > NOW() THEN
        v_days_remaining := CEIL(EXTRACT(EPOCH FROM (v_expires - NOW())) / 86400);
    ELSE
        v_days_remaining := 0;
    END IF;
    
    RETURN QUERY SELECT
        v_sub.id,
        v_sub.tier,
        v_sub.status,
        v_is_active,
        v_days_remaining,
        v_expires,
        (v_sub.tier IN ('premium', 'family') AND v_days_remaining <= 7 AND v_days_remaining > 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to activate subscription after payment
CREATE OR REPLACE FUNCTION activate_subscription(
    p_user_id UUID,
    p_tier VARCHAR(20),
    p_duration_months INTEGER DEFAULT 12
)
RETURNS user_subscriptions AS $$
DECLARE
    v_sub user_subscriptions;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    -- Get current subscription
    SELECT * INTO v_sub FROM user_subscriptions WHERE user_id = p_user_id;
    
    -- Calculate subscription period
    -- If currently active, extend from current expiry; otherwise start from now
    IF v_sub.subscription_expires_at IS NOT NULL AND v_sub.subscription_expires_at > NOW() THEN
        v_start := v_sub.subscription_expires_at;
    ELSE
        v_start := NOW();
    END IF;
    
    v_end := v_start + (p_duration_months || ' months')::INTERVAL;
    
    -- Update subscription
    UPDATE user_subscriptions
    SET
        tier = p_tier,
        status = 'active',
        subscription_started_at = COALESCE(subscription_started_at, NOW()),
        subscription_expires_at = v_end,
        renewal_reminder_7d_sent = FALSE,
        renewal_reminder_3d_sent = FALSE,
        renewal_reminder_1d_sent = FALSE,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_sub;
    
    RETURN v_sub;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find subscriptions needing renewal reminders
CREATE OR REPLACE FUNCTION get_subscriptions_needing_reminders(p_days_before INTEGER)
RETURNS TABLE (
    user_id UUID,
    tier VARCHAR(20),
    subscription_expires_at TIMESTAMPTZ,
    days_until_expiry INTEGER,
    user_email TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        us.user_id,
        us.tier,
        us.subscription_expires_at,
        CEIL(EXTRACT(EPOCH FROM (us.subscription_expires_at - NOW())) / 86400)::INTEGER as days_until_expiry,
        au.email as user_email
    FROM user_subscriptions us
    JOIN auth.users au ON us.user_id = au.id
    WHERE 
        us.status = 'active'
        AND us.tier IN ('premium', 'family')
        AND us.subscription_expires_at > NOW()
        AND us.subscription_expires_at <= NOW() + (p_days_before || ' days')::INTERVAL
        AND (
            (p_days_before = 7 AND NOT us.renewal_reminder_7d_sent)
            OR (p_days_before = 3 AND NOT us.renewal_reminder_3d_sent)
            OR (p_days_before = 1 AND NOT us.renewal_reminder_1d_sent)
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark renewal reminder as sent
CREATE OR REPLACE FUNCTION mark_renewal_reminder_sent(
    p_user_id UUID,
    p_days_before INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE user_subscriptions
    SET
        renewal_reminder_sent_at = NOW(),
        renewal_reminder_7d_sent = CASE WHEN p_days_before = 7 THEN TRUE ELSE renewal_reminder_7d_sent END,
        renewal_reminder_3d_sent = CASE WHEN p_days_before = 3 THEN TRUE ELSE renewal_reminder_3d_sent END,
        renewal_reminder_1d_sent = CASE WHEN p_days_before = 1 THEN TRUE ELSE renewal_reminder_1d_sent END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
