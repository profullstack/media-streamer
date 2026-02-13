-- Expire stale trial subscriptions
UPDATE user_subscriptions
SET status = 'expired'
WHERE tier = 'trial'
  AND status = 'active'
  AND trial_expires_at < now();

-- Expire stale paid subscriptions
UPDATE user_subscriptions
SET status = 'expired'
WHERE tier IN ('premium', 'family')
  AND status = 'active'
  AND subscription_expires_at IS NOT NULL
  AND subscription_expires_at < now();

-- Create a function that can be called periodically to expire stale subscriptions
CREATE OR REPLACE FUNCTION expire_stale_subscriptions()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE user_subscriptions
    SET status = 'expired'
    WHERE status = 'active'
      AND (
        (tier = 'trial' AND trial_expires_at < now())
        OR
        (tier IN ('premium', 'family') AND subscription_expires_at IS NOT NULL AND subscription_expires_at < now())
      )
    RETURNING id
  )
  SELECT count(*) INTO expired_count FROM expired;
  
  RETURN expired_count;
END;
$$;
