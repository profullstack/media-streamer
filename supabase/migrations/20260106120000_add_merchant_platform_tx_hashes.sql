-- Add merchant_tx_hash and platform_tx_hash columns to payment_history
-- These columns track additional transaction hashes for forwarded payments:
-- - merchant_tx_hash: The transaction hash for funds forwarded to merchant wallet
-- - platform_tx_hash: The transaction hash for platform fee transactions

ALTER TABLE payment_history
ADD COLUMN merchant_tx_hash VARCHAR(255),
ADD COLUMN platform_tx_hash VARCHAR(255);

-- Add comments to document the columns
COMMENT ON COLUMN payment_history.tx_hash IS 'Transaction hash for the incoming payment (detected/confirmed events)';
COMMENT ON COLUMN payment_history.merchant_tx_hash IS 'Transaction hash for funds forwarded to merchant wallet (forwarded events)';
COMMENT ON COLUMN payment_history.platform_tx_hash IS 'Transaction hash for platform fee transactions (forwarded events)';
