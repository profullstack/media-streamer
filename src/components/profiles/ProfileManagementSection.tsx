/**
 * Profile Management Section Component
 *
 * Section for the account page to manage profiles (view, edit, delete)
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ProfileAvatar } from './ProfileAvatar';
import { AddProfileButton } from './AddProfileButton';
import { CreateProfileDialog } from './CreateProfileDialog';
import { EditProfileDialog } from './EditProfileDialog';
import { LoadingSpinner, EditIcon, TrashIcon } from '@/components/ui/icons';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/profiles/types';

export function ProfileManagementSection(): React.ReactElement {
  const { hasFamilyPlan } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  // Load profiles
  const loadProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
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

  // Handle creating a new profile
  const handleCreateProfile = useCallback(() => {
    if (!hasFamilyPlan) {
      alert('Multiple profiles are only available on the Family plan. Please upgrade to create additional profiles.');
      return;
    }
    if (profiles.length >= 5) {
      alert('Maximum 10 profiles allowed');
      return;
    }
    setShowCreateDialog(true);
  }, [hasFamilyPlan, profiles.length]);

  const handleProfileCreated = useCallback(() => {
    setShowCreateDialog(false);
    loadProfiles();
  }, [loadProfiles]);

  // Handle editing a profile
  const handleEditProfile = useCallback((profile: Profile) => {
    setEditingProfile(profile);
  }, []);

  const handleProfileUpdated = useCallback(() => {
    setEditingProfile(null);
    loadProfiles();
  }, [loadProfiles]);

  // Handle deleting a profile
  const handleDeleteProfile = useCallback(async (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    if (profile.is_default) {
      alert('Cannot delete the default profile');
      return;
    }

    if (profiles.length <= 1) {
      alert('Cannot delete the last profile');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete the profile "${profile.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingProfileId(profileId);
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete profile');
      }

      await loadProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete profile');
    } finally {
      setDeletingProfileId(null);
    }
  }, [profiles, loadProfiles]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Profile Management</h2>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size={32} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Profile Management</h2>
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={loadProfiles}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Profile Management</h2>
          <p className="text-sm text-text-muted">
            {profiles.length}/10 profiles
          </p>
        </div>

        <p className="text-sm text-text-muted">
          Manage your Netflix-style profiles. Each profile has its own favorites, watch history, and settings.
          {!hasFamilyPlan && (
            <span className="block mt-1 text-yellow-600">
              Multiple profiles are only available on the Family plan.
            </span>
          )}
        </p>

        {/* Profiles Grid */}
        <div className="space-y-4">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={cn(
                'flex items-center gap-4 p-4 bg-bg-tertiary rounded-lg border border-border-subtle',
                'hover:bg-bg-hover transition-colors'
              )}
            >
              {/* Profile Avatar */}
              <ProfileAvatar
                id={profile.id}
                name={profile.name}
                avatarUrl={profile.avatar_url}
                avatarEmoji={profile.avatar_emoji}
                isDefault={profile.is_default}
                size="sm"
                className="flex-shrink-0"
              />

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-text-primary truncate">
                    {profile.name}
                  </h3>
                  {profile.is_default && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-muted">
                  Created {new Date(profile.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditProfile(profile)}
                  className={cn(
                    'p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                    'rounded-lg transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500'
                  )}
                  title="Edit profile"
                >
                  <EditIcon size={16} />
                </button>

                {!profile.is_default && profiles.length > 1 && (
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    disabled={deletingProfileId === profile.id}
                    className={cn(
                      'p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20',
                      'rounded-lg transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-red-500',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                    title="Delete profile"
                  >
                    {deletingProfileId === profile.id ? (
                      <LoadingSpinner size={16} />
                    ) : (
                      <TrashIcon size={16} />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add Profile Button - only for family plan users */}
          {hasFamilyPlan && profiles.length < 5 && (
            <div className="flex items-center justify-center p-8 border-2 border-dashed border-border-subtle rounded-lg">
              <AddProfileButton
                size="sm"
                onClick={handleCreateProfile}
                className="scale-75"
              />
            </div>
          )}
        </div>

        {hasFamilyPlan && profiles.length >= 5 && (
          <p className="text-sm text-text-muted text-center py-4">
            You have reached the maximum of 10 profiles per account.
          </p>
        )}

        {!hasFamilyPlan && (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted mb-2">
              Want multiple profiles for your family?
            </p>
            <p className="text-sm text-yellow-600">
              Upgrade to the Family plan to create up to 10 profiles with separate favorites, watch history, and settings.
            </p>
          </div>
        )}
      </div>

      {/* Create Profile Dialog */}
      <CreateProfileDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onProfileCreated={handleProfileCreated}
      />

      {/* Edit Profile Dialog */}
      {editingProfile && (
        <EditProfileDialog
          open={!!editingProfile}
          profile={editingProfile}
          onClose={() => setEditingProfile(null)}
          onProfileUpdated={handleProfileUpdated}
        />
      )}
    </>
  );
}