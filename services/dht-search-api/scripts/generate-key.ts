#!/usr/bin/env tsx
/**
 * Generate a new API key for the DHT Search API
 *
 * Usage:
 *   pnpm generate-key [tier] [name] [email]
 *
 * Arguments:
 *   tier  - API tier: free, basic, pro, enterprise (default: free)
 *   name  - Friendly name for the key (default: "Unnamed Key")
 *   email - Owner email (optional)
 *
 * Examples:
 *   pnpm generate-key
 *   pnpm generate-key basic "My App"
 *   pnpm generate-key pro "Production" admin@example.com
 */

import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Tier configurations
const TIER_CONFIGS: Record<string, { rate_limit: number; daily_limit: number }> = {
  free: { rate_limit: 30, daily_limit: 1000 },
  basic: { rate_limit: 60, daily_limit: 10000 },
  pro: { rate_limit: 120, daily_limit: 50000 },
  enterprise: { rate_limit: 300, daily_limit: 1000000 },
};

async function main() {
  // Parse arguments
  const tier = process.argv[2] || 'free';
  const name = process.argv[3] || 'Unnamed Key';
  const email = process.argv[4] || null;

  // Validate tier
  if (!TIER_CONFIGS[tier]) {
    console.error(`Invalid tier: ${tier}`);
    console.error(`Valid tiers: ${Object.keys(TIER_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const salt = process.env.API_KEY_SALT;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
    console.error('Please set these in your .env file or environment');
    process.exit(1);
  }

  if (!salt) {
    console.error('Missing API_KEY_SALT environment variable');
    console.error('Please set this in your .env file or environment');
    process.exit(1);
  }

  // Create Supabase client
  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Generate key
  const rawKey = `dht_live_${randomBytes(24).toString('base64url')}`;
  const keyHash = createHash('sha256').update(rawKey + salt).digest('hex');
  const keyPrefix = rawKey.slice(0, 12);

  const tierConfig = TIER_CONFIGS[tier];

  // Insert into database
  const { error } = await db.from('dht_api_keys').insert({
    key_hash: keyHash,
    key_prefix: keyPrefix,
    name,
    tier,
    rate_limit_per_min: tierConfig.rate_limit,
    daily_limit: tierConfig.daily_limit,
    owner_email: email,
    is_active: true,
  });

  if (error) {
    console.error('Failed to create API key:', error.message);
    process.exit(1);
  }

  console.log('\n=================================');
  console.log('   API Key Created Successfully   ');
  console.log('=================================\n');
  console.log(`Key:         ${rawKey}`);
  console.log(`Prefix:      ${keyPrefix}`);
  console.log(`Tier:        ${tier}`);
  console.log(`Name:        ${name}`);
  console.log(`Rate Limit:  ${tierConfig.rate_limit}/min`);
  console.log(`Daily Limit: ${tierConfig.daily_limit.toLocaleString()}`);
  if (email) {
    console.log(`Email:       ${email}`);
  }
  console.log('\n*** SAVE THIS KEY - IT CANNOT BE RETRIEVED LATER! ***\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
