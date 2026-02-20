/**
 * Create Profile Dialog Component
 *
 * Dialog for creating a new profile with name and avatar options
 */

'use client';

import React, { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import type { CreateProfileInput } from '@/lib/profiles/types';

export interface CreateProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onProfileCreated: () => void;
}

// Popular emoji options for avatars
const EMOJI_OPTIONS = [
  '😀', '😃', '😄', '😁', '😆', '🥳', '🤩', '😎', '🤓', '🧐',
  '🤠', '👻', '🤖', '👽', '🎭', '🎪', '🎨', '🎬', '🎮', '🎯',
  '⭐', '🌟', '💫', '✨', '🔥', '💥', '⚡', '🌈', '🦄', '🐉',
  '🦊', '🐱', '🐶', '🐼', '🐻', '🦁', '🐯', '🐨', '🐸', '🐙',
  '🍎', '🍕', '🍩', '🍪', '🎂', '🍓', '🥑', '🌮', '🍔', '🍟',
];

export function CreateProfileDialog({
  open,
  onClose,
  onProfileCreated,
}: CreateProfileDialogProps): React.ReactElement {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!name.trim()) {
        setError('Profile name is required');
        return;
      }

      if (name.trim().length > 50) {
        setError('Profile name must be 50 characters or less');
        return;
      }

      setError(null);
      setIsCreating(true);

      try {
        const input: Omit<CreateProfileInput, 'account_id'> = {
          name: name.trim(),
          avatar_emoji: selectedEmoji || null,
        };

        const response = await fetch('/api/profiles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create profile');
        }

        // Success
        setName('');
        setSelectedEmoji('');
        onProfileCreated();
      } catch (error) {
        console.error('Create profile error:', error);
        setError(error instanceof Error ? error.message : 'Failed to create profile');
      } finally {
        setIsCreating(false);
      }
    },
    [name, selectedEmoji, onProfileCreated]
  );

  const handleClose = useCallback(() => {
    if (isCreating) return;
    setName('');
    setSelectedEmoji('');
    setError(null);
    onClose();
  }, [isCreating, onClose]);

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Create Profile"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Name */}
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium text-white mb-2">
            Profile Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter profile name"
            className={cn(
              'w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg',
              'text-white placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            disabled={isCreating}
            maxLength={50}
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            {name.length}/50 characters
          </p>
        </div>

        {/* Avatar Emoji Selector */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Choose an Avatar (optional)
          </label>
          <div className="grid grid-cols-10 gap-2 max-h-32 overflow-y-auto p-2 bg-gray-800 rounded-lg border border-gray-600">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji === selectedEmoji ? '' : emoji)}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-lg',
                  'hover:bg-gray-700 transition-colors duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  selectedEmoji === emoji
                    ? 'bg-blue-600 ring-2 ring-blue-500'
                    : 'bg-gray-900'
                )}
                disabled={isCreating}
              >
                {emoji}
              </button>
            ))}
          </div>
          {selectedEmoji && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-300">
              <span>Selected:</span>
              <span className="text-2xl">{selectedEmoji}</span>
              <button
                type="button"
                onClick={() => setSelectedEmoji('')}
                className="text-red-400 hover:text-red-300 underline"
                disabled={isCreating}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating || !name.trim()}
            className={cn(
              'px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg',
              'transition-colors duration-200 flex items-center gap-2',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isCreating && <LoadingSpinner size={16} />}
            {isCreating ? 'Creating...' : 'Create Profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}