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
  const [optimisticUpvotes, setOptimisticUpvotes] = useState(upvotes);
  const [optimisticDownvotes, setOptimisticDownvotes] = useState(downvotes);
  const [optimisticUserVote, setOptimisticUserVote] = useState(userVote);

  // Sync optimistic state with props when they change
  if (upvotes !== optimisticUpvotes && !isVoting) {
    setOptimisticUpvotes(upvotes);
  }
  if (downvotes !== optimisticDownvotes && !isVoting) {
    setOptimisticDownvotes(downvotes);
  }
  if (userVote !== optimisticUserVote && !isVoting) {
    setOptimisticUserVote(userVote);
  }

  const handleVote = useCallback(async (value: 1 | -1) => {
    if (!isAuthenticated || isVoting) return;

    setIsVoting(true);

    // Optimistic update
    const previousVote = optimisticUserVote;
    
    if (previousVote === value) {
      // Clicking same vote removes it
      setOptimisticUserVote(null);
      if (value === 1) {
        setOptimisticUpvotes(prev => prev - 1);
      } else {
        setOptimisticDownvotes(prev => prev - 1);
      }
      
      try {
        await onRemoveVote();
      } catch {
        // Revert on error
        setOptimisticUserVote(previousVote);
        if (value === 1) {
          setOptimisticUpvotes(prev => prev + 1);
        } else {
          setOptimisticDownvotes(prev => prev + 1);
        }
      }
    } else {
      // New vote or changing vote
      setOptimisticUserVote(value);
      
      if (previousVote === 1) {
        setOptimisticUpvotes(prev => prev - 1);
      } else if (previousVote === -1) {
        setOptimisticDownvotes(prev => prev - 1);
      }
      
      if (value === 1) {
        setOptimisticUpvotes(prev => prev + 1);
      } else {
        setOptimisticDownvotes(prev => prev + 1);
      }
      
      try {
        await onVote(value);
      } catch {
        // Revert on error
        setOptimisticUserVote(previousVote);
        
        if (previousVote === 1) {
          setOptimisticUpvotes(prev => prev + 1);
        } else if (previousVote === -1) {
          setOptimisticDownvotes(prev => prev + 1);
        }
        
        if (value === 1) {
          setOptimisticUpvotes(prev => prev - 1);
        } else {
          setOptimisticDownvotes(prev => prev - 1);
        }
      }
    }

    setIsVoting(false);
  }, [isAuthenticated, isVoting, optimisticUserVote, onVote, onRemoveVote]);

  const iconSize = size === 'sm' ? 14 : 18;
  const buttonPadding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  const score = optimisticUpvotes - optimisticDownvotes;

  return (
    <div className="flex items-center gap-1">
      {/* Upvote button */}
      <button
        type="button"
        onClick={() => handleVote(1)}
        disabled={!isAuthenticated || isVoting}
        className={`flex items-center gap-1 rounded-md ${buttonPadding} transition-colors ${
          optimisticUserVote === 1
            ? 'bg-green-500/20 text-green-500'
            : 'text-text-muted hover:bg-bg-tertiary hover:text-green-500'
        } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''}`}
        title={isAuthenticated ? 'Upvote' : 'Login to vote'}
      >
        <ThumbsUpIcon size={iconSize} />
        {showCounts && (
          <span className={textSize}>{optimisticUpvotes}</span>
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
          optimisticUserVote === -1
            ? 'bg-red-500/20 text-red-500'
            : 'text-text-muted hover:bg-bg-tertiary hover:text-red-500'
        } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''}`}
        title={isAuthenticated ? 'Downvote' : 'Login to vote'}
      >
        <ThumbsDownIcon size={iconSize} />
        {showCounts && (
          <span className={textSize}>{optimisticDownvotes}</span>
        )}
      </button>
    </div>
  );
}
