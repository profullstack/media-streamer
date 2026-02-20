/**
 * Profile Selector Component
 *
 * Netflix-style grid of profile avatars shown after login
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileAvatar } from './ProfileAvatar';
import { AddProfileButton } from './AddProfileButton';
import { CreateProfileDialog } from './CreateProfileDialog';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/profiles/types';

export interface ProfileSelectorProps {
  profiles: Profile[];
  hasFamilyPlan: boolean;
  onProfileSelect: (profileId: string) => Promise<void>;
  onProfilesChange?: () => void;
  className?: string;
}

export function ProfileSelector({
  profiles,
  hasFamilyPlan,
  onProfileSelect,
  onProfilesChange,
  className,
}: ProfileSelectorProps): React.ReactElement {
  const router = useRouter();
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleProfileSelect = useCallback(
    async (profileId: string) => {
      if (isSelectingProfile) return;

      try {
        setIsSelectingProfile(true);
        await onProfileSelect(profileId);
        
        // Redirect to main app after successful selection
        router.push('/');
      } catch (error) {
        console.error('Failed to select profile:', error);
        // TODO: Show error toast
      } finally {
        setIsSelectingProfile(false);
      }
    },
    [onProfileSelect, router, isSelectingProfile]
  );

  const handleCreateProfile = useCallback(() => {
    if (!hasFamilyPlan) {
      // TODO: Show error toast
      console.error('Multiple profiles require Family plan');
      return;
    }
    if (profiles.length >= 5) {
      // TODO: Show error toast
      console.error('Maximum 5 profiles allowed');
      return;
    }
    setShowCreateDialog(true);
  }, [hasFamilyPlan, profiles.length]);

  const handleProfileCreated = useCallback(() => {
    setShowCreateDialog(false);
    if (onProfilesChange) {
      onProfilesChange();
    }
  }, [onProfilesChange]);

  const canAddProfile = hasFamilyPlan && profiles.length < 5;

  return (
    <>
      <div className={cn('min-h-screen bg-black flex flex-col items-center justify-center', className)}>
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Who&apos;s watching?</h1>
          <p className="text-gray-400 text-lg">Choose a profile to continue</p>
        </div>

        {/* Profiles Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8 max-w-6xl">
          {/* Existing Profiles */}
          {profiles.map((profile) => (
            <ProfileAvatar
              key={profile.id}
              id={profile.id}
              name={profile.name}
              avatarUrl={profile.avatar_url}
              avatarEmoji={profile.avatar_emoji}
              isDefault={profile.is_default}
              onClick={handleProfileSelect}
              className={cn(
                isSelectingProfile && 'pointer-events-none opacity-50'
              )}
            />
          ))}

          {/* Add Profile Button */}
          {canAddProfile && (
            <AddProfileButton
              onClick={handleCreateProfile}
              disabled={isSelectingProfile}
            />
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 text-sm">
            Select a profile above
            {hasFamilyPlan && canAddProfile && ' or create a new one'}
            {hasFamilyPlan && !canAddProfile && ' (maximum 5 profiles)'}
            {!hasFamilyPlan && ' (upgrade to Family plan for multiple profiles)'}
          </p>
        </div>
      </div>

      {/* Create Profile Dialog */}
      <CreateProfileDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onProfileCreated={handleProfileCreated}
      />
    </>
  );
}