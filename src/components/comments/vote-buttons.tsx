'use client';

/**
 * Vote Buttons Component
 *
 * Displays upvote/downvote buttons with vote counts.
 * Requires authentication to vote.
 */

import { useState, useCallback } from 'react';
import { ThumbsUpIcon, ThumbsDownIcon } from '@/components/ui/icons';

interface VoteButtonsProps {
  /** Current upvote count */
  upvotes: number;
  /** Current downvote count */
  downvotes: number;
  /** User's current vote (1 for upvote, -1 for downvote, null for no vote) */
  userVote: 1 | -1 | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Callback when user votes */
  onVote: (value: 1 | -1) => Promise<void>;
  /** Callback when user removes their vote */
  onRemoveVote: () => Promise<void>;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Whether to show vote counts */
  showCounts?: boolean;
}

export function VoteButtons({
  upvotes,
  downvotes,
  userVote,
  isAuthenticated,
  onVote,
  onRemoveVote,
  size = 'md',
  showCounts = true,
}: VoteButtonsProps): React.ReactElement {
  const [isVoting, setIsVoting] = useState(false);

  // Use props directly - parent component manages state and updates after API calls
  // This ensures we always show the server-confirmed values
  const displayUpvotes = upvotes;
  const displayDownvotes = downvotes;
  const displayUserVote = userVote;

  const handleVote = useCallback(async (value: 1 | -1) => {
    if (!isAuthenticated || isVoting) return;

    setIsVoting(true);

    try {
      if (displayUserVote === value) {
        // Clicking same vote removes it
        await onRemoveVote();
      } else {
        // New vote or changing vote
        await onVote(value);
      }
    } catch (error) {
      console.error('Vote failed:', error);
    } finally {
      setIsVoting(false);
    }
  }, [isAuthenticated, isVoting, displayUserVote, onVote, onRemoveVote]);

  const iconSize = size === 'sm' ? 14 : 18;
  const buttonPadding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  const score = displayUpvotes - displayDownvotes;

  return (
    <div className="flex items-center gap-1">
      {/* Upvote button */}
      <button
        type="button"
        onClick={() => handleVote(1)}
        disabled={!isAuthenticated || isVoting}
        className={`flex items-center gap-1 rounded-md ${buttonPadding} transition-colors ${
          displayUserVote === 1
            ? 'bg-green-500/20 text-green-500'
            : 'text-text-muted hover:bg-bg-tertiary hover:text-green-500'
        } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''} ${isVoting ? 'opacity-70' : ''}`}
        title={isAuthenticated ? 'Upvote' : 'Login to vote'}
      >
        <ThumbsUpIcon size={iconSize} className={isVoting ? 'animate-pulse' : ''} />
        {showCounts && (
          <span className={textSize}>{displayUpvotes}</span>
        )}
      </button>

      {/* Score display (optional) */}
      {!showCounts && (
        <span className={`${textSize} font-medium ${
          score > 0 ? 'text-green-500' : score < 0 ? 'text-red-500' : 'text-text-muted'
        }`}>
          {score > 0 ? '+' : ''}{score}
        </span>
      )}

      {/* Downvote button */}
      <button
        type="button"
        onClick={() => handleVote(-1)}
        disabled={!isAuthenticated || isVoting}
        className={`flex items-center gap-1 rounded-md ${buttonPadding} transition-colors ${
          displayUserVote === -1
            ? 'bg-red-500/20 text-red-500'
            : 'text-text-muted hover:bg-bg-tertiary hover:text-red-500'
        } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''} ${isVoting ? 'opacity-70' : ''}`}
        title={isAuthenticated ? 'Downvote' : 'Login to vote'}
      >
        <ThumbsDownIcon size={iconSize} className={isVoting ? 'animate-pulse' : ''} />
        {showCounts && (
          <span className={textSize}>{displayDownvotes}</span>
        )}
      </button>
    </div>
  );
}
