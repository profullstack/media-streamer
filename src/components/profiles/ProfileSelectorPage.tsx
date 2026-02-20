/**
 * Profile Selector Page Component
 *
 * Full-page component that shows profile selector after login
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileSelector } from './ProfileSelector';
import { LoadingSpinner } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import type { Profile } from '@/lib/profiles/types';

export function ProfileSelectorPage(): React.ReactElement {
  const router = useRouter();
  const { hasFamilyPlan, needsProfileSelection } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to main app if profile selection is not needed
  useEffect(() => {
    if (!isLoading && !needsProfileSelection) {
      router.push('/');
    }
  }, [isLoading, needsProfileSelection, router]);

  // Load profiles
  const loadProfiles = useCallback(async () => {
    try {
      const response = await fetch('/api/profiles');
      
      if (!response.ok) {
        throw new Error('Failed to load profiles');
      }

      const data = await response.json();
      setProfiles(data.profiles || []);
      setError(null);
    } catch (error) {
      console.error('Failed to load profiles:', error);
      setError(error instanceof Error ? error.message : 'Failed to load profiles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Handle profile selection
  const handleProfileSelect = useCallback(async (profileId: string) => {
    const response = await fetch(`/api/profiles/${profileId}/select`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to select profile');
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="text-white mb-4" />
          <p className="text-gray-400">Loading profiles...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-4">Failed to load profiles</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={loadProfiles}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-white text-lg mb-4">No profiles found</p>
          <p className="text-gray-400 text-sm mb-6">
            Something went wrong. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Don't render if profile selection is not needed
  if (!needsProfileSelection && !isLoading) {
    return <div>Redirecting...</div>;
  }

  return (
    <ProfileSelector
      profiles={profiles}
      hasFamilyPlan={hasFamilyPlan}
      onProfileSelect={handleProfileSelect}
      onProfilesChange={loadProfiles}
    />
  );
}