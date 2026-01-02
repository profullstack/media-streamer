'use client';

/**
 * Torrent Voting Component
 *
 * Displays upvote/downvote buttons for a torrent.
 * Requires authentication to vote.
 */

import { useState, useEffect, useCallback } from 'react';
import { VoteButtons } from './vote-buttons';

interface User {
  id: string;
  email: string;
}

interface TorrentVotingProps {
  /** Torrent ID */
  torrentId: string;
  /** Current authenticated user (null if not logged in) */
  user: User | null;
  /** Size variant */
  size?: 'sm' | 'md';
}

interface VoteData {
  upvotes: number;
  downvotes: number;
  userVote: 1 | -1 | null;
}

export function TorrentVoting({ torrentId, user, size = 'md' }: TorrentVotingProps): React.ReactElement {
  const [voteData, setVoteData] = useState<VoteData>({
    upvotes: 0,
    downvotes: 0,
    userVote: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch vote data
  useEffect(() => {
    const fetchVotes = async () => {
      try {
        const response = await fetch(`/api/torrents/${torrentId}/vote`);
        if (response.ok) {
          const data = await response.json() as VoteData;
          setVoteData(data);
        }
      } catch (err) {
        console.error('Failed to fetch vote data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchVotes();
  }, [torrentId]);

  // Handle vote
  const handleVote = useCallback(async (value: 1 | -1) => {
    if (!user) return;

    const response = await fetch(`/api/torrents/${torrentId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      throw new Error('Failed to vote');
    }

    // Optimistic update is handled by VoteButtons
  }, [user, torrentId]);

  // Handle remove vote
  const handleRemoveVote = useCallback(async () => {
    if (!user) return;

    const response = await fetch(`/api/torrents/${torrentId}/vote`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to remove vote');
    }
  }, [user, torrentId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 opacity-50">
        <div className="h-6 w-12 animate-pulse rounded bg-bg-tertiary" />
        <div className="h-6 w-12 animate-pulse rounded bg-bg-tertiary" />
      </div>
    );
  }

  return (
    <VoteButtons
      upvotes={voteData.upvotes}
      downvotes={voteData.downvotes}
      userVote={voteData.userVote}
      isAuthenticated={!!user}
      onVote={handleVote}
      onRemoveVote={handleRemoveVote}
      size={size}
    />
  );
}
