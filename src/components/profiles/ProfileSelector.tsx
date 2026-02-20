/**
 * Profile Selector Component
 *
 * Netflix-style grid of profile avatars shown after login.
 * Always shown unless user has set a default profile to bypass.
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
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

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
      } finally {
        setIsSelectingProfile(false);
      }
    },
    [onProfileSelect, router, isSelectingProfile]
  );

  const handleSetDefault = useCallback(async (profileId: string) => {
    try {
      setSettingDefault(profileId);
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (!response.ok) {
        throw new Error('Failed to set default profile');
      }
      if (onProfilesChange) {
        onProfilesChange();
      }
    } catch (error) {
      console.error('Failed to set default:', error);
    } finally {
      setSettingDefault(null);
    }
  }, [onProfilesChange]);

  const handleClearDefault = useCallback(async (profileId: string) => {
    try {
      setSettingDefault(profileId);
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: false }),
      });
      if (!response.ok) {
        throw new Error('Failed to clear default profile');
      }
      if (onProfilesChange) {
        onProfilesChange();
      }
    } catch (error) {
      console.error('Failed to clear default:', error);
    } finally {
      setSettingDefault(null);
    }
  }, [onProfilesChange]);

  const handleCreateProfile = useCallback(() => {
    if (!hasFamilyPlan) {
      console.error('Multiple profiles require Family plan');
      return;
    }
    if (profiles.length >= 10) {
      console.error('Maximum 10 profiles allowed');
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

  const canAddProfile = hasFamilyPlan && profiles.length < 10;

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
            <div key={profile.id} className="flex flex-col items-center gap-2">
              <ProfileAvatar
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
              {/* Set/clear default toggle */}
              <button
                onClick={() => profile.is_default 
                  ? handleClearDefault(profile.id) 
                  : handleSetDefault(profile.id)
                }
                disabled={settingDefault === profile.id}
                className={cn(
                  'text-xs px-2 py-1 rounded transition-colors',
                  profile.is_default
                    ? 'text-blue-400 hover:text-blue-300'
                    : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {settingDefault === profile.id
                  ? '...'
                  : profile.is_default
                    ? '★ Default (auto-selects)'
                    : 'Set as default'}
              </button>
            </div>
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
        <div className="mt-16 text-center space-y-2">
          <p className="text-gray-500 text-sm">
            Select a profile above to start watching
          </p>
          <p className="text-gray-600 text-xs">
            {profiles.some(p => p.is_default)
              ? 'The default profile will be auto-selected on future logins'
              : 'Set a default profile to skip this screen next time'}
          </p>
          {!hasFamilyPlan && profiles.length >= 1 && (
            <p className="text-gray-600 text-xs">
              Upgrade to Family plan to add more profiles
            </p>
          )}
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
