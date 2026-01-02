#!/usr/bin/env npx tsx
/**
 * Fix Pending Payment Script
 *
 * Manually confirms a pending payment and activates the subscription
 * when the webhook was not received.
 *
 * Usage:
 *   pnpm tsx scripts/fix-pending-payment.ts <coinpayportal_payment_id>
 *
 * Or to find and fix by user email:
 *   pnpm tsx scripts/fix-pending-payment.ts --email <user_email>
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/supabase/types';

// Load environment variables from .env
config({ path: '.env' });

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Types
// ============================================================================

interface PaymentRecord {
  id: string;
  user_id: string;
  coinpayportal_payment_id: string;
  amount_usd: number;
  plan: string;
  duration_months: number;
  status: string;
  created_at: string;
}

// ============================================================================
// Functions
// ============================================================================

async function findPendingPaymentsByEmail(email: string): Promise<PaymentRecord[]> {
  // Use auth admin API to find user by email
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    throw new Error(`Failed to list users: ${authError.message}`);
  }

  const user = authData.users.find(u => u.email === email);
  if (!user) {
    throw new Error(`User not found with email: ${email}`);
  }

  // Find pending payments for this user
  const { data: payments, error: paymentError } = await supabase
    .from('payment_history')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (paymentError) {
    throw new Error(`Failed to find payments: ${paymentError.message}`);
  }

  return payments ?? [];
}

async function findPaymentById(paymentId: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from('payment_history')
    .select('*')
    .eq('coinpayportal_payment_id', paymentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to find payment: ${error.message}`);
  }

  return data;
}

async function confirmPayment(payment: PaymentRecord): Promise<void> {
  console.log(`\nConfirming payment ${payment.coinpayportal_payment_id}...`);
  console.log(`  User ID: ${payment.user_id}`);
  console.log(`  Plan: ${payment.plan}`);
  console.log(`  Amount: $${payment.amount_usd}`);
  console.log(`  Duration: ${payment.duration_months} months`);

  const now = new Date();
  const periodStart = now;
  const periodEnd = new Date(now.getTime());
  periodEnd.setMonth(periodEnd.getMonth() + payment.duration_months);

  // Update payment status
  const { error: updateError } = await supabase
    .from('payment_history')
    .update({
      status: 'confirmed',
      completed_at: now.toISOString(),
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      webhook_event_type: 'manual_confirmation',
      webhook_received_at: now.toISOString(),
    })
    .eq('id', payment.id);

  if (updateError) {
    throw new Error(`Failed to update payment: ${updateError.message}`);
  }

  console.log('  ✓ Payment status updated to confirmed');

  // Activate subscription using the database function
  const { error: subscriptionError } = await supabase.rpc('activate_subscription', {
    p_user_id: payment.user_id,
    p_tier: payment.plan,
    p_duration_months: payment.duration_months,
  });

  if (subscriptionError) {
    throw new Error(`Failed to activate subscription: ${subscriptionError.message}`);
  }

  console.log(`  ✓ Subscription activated: ${payment.plan} for ${payment.duration_months} months`);
  console.log(`  ✓ Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
}

async function listAllPendingPayments(): Promise<void> {
  const { data: payments, error } = await supabase
    .from('payment_history')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list payments: ${error.message}`);
  }

  if (!payments || payments.length === 0) {
    console.log('No pending payments found.');
    return;
  }

  console.log(`\nFound ${payments.length} pending payment(s):\n`);
  
  for (const payment of payments) {
    console.log(`  ID: ${payment.coinpayportal_payment_id}`);
    console.log(`  User: ${payment.user_id}`);
    console.log(`  Plan: ${payment.plan}`);
    console.log(`  Amount: $${payment.amount_usd}`);
    console.log(`  Created: ${payment.created_at}`);
    console.log('  ---');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Listing all pending payments...');
    await listAllPendingPayments();
    console.log('\nUsage:');
    console.log('  pnpm tsx scripts/fix-pending-payment.ts <coinpayportal_payment_id>');
    console.log('  pnpm tsx scripts/fix-pending-payment.ts --email <user_email>');
    return;
  }

  if (args[0] === '--email' && args[1]) {
    const email = args[1];
    console.log(`Finding pending payments for ${email}...`);
    
    const payments = await findPendingPaymentsByEmail(email);
    
    if (payments.length === 0) {
      console.log('No pending payments found for this user.');
      return;
    }

    console.log(`Found ${payments.length} pending payment(s).`);
    
    for (const payment of payments) {
      await confirmPayment(payment);
    }

    console.log('\n✓ All pending payments confirmed!');
    return;
  }

  // Assume it's a payment ID
  const paymentId = args[0];
  console.log(`Finding payment ${paymentId}...`);

  const payment = await findPaymentById(paymentId);

  if (!payment) {
    console.error(`Payment not found: ${paymentId}`);
    process.exit(1);
  }

  if (payment.status !== 'pending') {
    console.log(`Payment is already ${payment.status}, no action needed.`);
    return;
  }

  await confirmPayment(payment);
  console.log('\n✓ Payment confirmed and subscription activated!');
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
