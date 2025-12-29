/**
 * XXX Page
 *
 * Browse adult content torrents.
 * This page is protected and only accessible to paid subscribers (premium/family).
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { MainLayout } from '@/components/layout';
import { XxxBrowseContent } from './xxx-browse-content';

/**
 * Check if user has an active paid subscription (premium or family)
 * Returns false if not logged in or on trial
 */
async function hasActivePaidSubscription(): Promise<boolean> {
  try {
    const supabase = createServerClient();
    
    // Get the current user from the session
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }
    
    // Check subscription status
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('tier, status, subscription_expires_at')
      .eq('user_id', user.id)
      .single();
    
    if (!subscription) {
      return false;
    }
    
    // Only premium and family tiers with active status can see XXX
    if (subscription.tier !== 'premium' && subscription.tier !== 'family') {
      return false;
    }
    
    if (subscription.status !== 'active') {
      return false;
    }
    
    // Check if subscription hasn't expired
    if (subscription.subscription_expires_at) {
      const expiresAt = new Date(subscription.subscription_expires_at);
      if (expiresAt < new Date()) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

export default async function XxxPage(): Promise<React.ReactElement> {
  // Server-side auth check
  const canAccess = await hasActivePaidSubscription();
  
  if (!canAccess) {
    // Redirect to subscription page if not authorized
    redirect('/subscription?reason=xxx_access');
  }
  
  return (
    <MainLayout>
      <XxxBrowseContent />
    </MainLayout>
  );
}
