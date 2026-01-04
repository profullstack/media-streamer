'use client';

/**
 * Torrent Voting Component
 *
 * Displays upvote/downvote buttons and favorites button for a torrent.
 * Requires authentication to vote or favorite.
 */

import { useState, useEffect, useCallback } from 'react';
import { VoteButtons } from './vote-buttons';
import { TorrentFavoriteButton } from '@/components/ui/torrent-favorite-button';
import { HeartIcon } from '@/components/ui/icons';

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
  favoritesCount: number;
  isFavorited: boolean;
}

interface VoteResponse extends VoteData {
  vote?: unknown;
  success?: boolean;
}

export function TorrentVoting({ torrentId, user, size = 'md' }: TorrentVotingProps): React.ReactElement {
  const [voteData, setVoteData] = useState<VoteData>({
    upvotes: 0,
    downvotes: 0,
    userVote: null,
    favoritesCount: 0,
    isFavorited: false,
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

  // Handle vote - returns updated counts from server
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

    // Update state with server response
    const data = await response.json() as VoteResponse;
    setVoteData(prev => ({
      ...prev,
      upvotes: data.upvotes,
      downvotes: data.downvotes,
      userVote: data.userVote,
    }));
  }, [user, torrentId]);

  // Handle remove vote - returns updated counts from server
  const handleRemoveVote = useCallback(async () => {
    if (!user) return;

    const response = await fetch(`/api/torrents/${torrentId}/vote`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to remove vote');
    }

    // Update state with server response
    const data = await response.json() as VoteResponse;
    setVoteData(prev => ({
      ...prev,
      upvotes: data.upvotes,
      downvotes: data.downvotes,
      userVote: data.userVote,
    }));
  }, [user, torrentId]);

  // Handle favorite toggle - update local count
  const handleFavoriteToggle = useCallback((torrentId: string, isFavorited: boolean) => {
    setVoteData(prev => ({
      ...prev,
      favoritesCount: isFavorited ? prev.favoritesCount + 1 : prev.favoritesCount - 1,
      isFavorited,
    }));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 opacity-50">
        <div className="h-6 w-12 animate-pulse rounded bg-bg-tertiary" />
        <div className="h-6 w-12 animate-pulse rounded bg-bg-tertiary" />
        <div className="h-6 w-12 animate-pulse rounded bg-bg-tertiary" />
      </div>
    );
  }

  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-4">
      {/* Vote buttons */}
      <VoteButtons
        upvotes={voteData.upvotes}
        downvotes={voteData.downvotes}
        userVote={voteData.userVote}
        isAuthenticated={!!user}
        onVote={handleVote}
        onRemoveVote={handleRemoveVote}
        size={size}
      />

      {/* Favorites section */}
      <div className="flex items-center gap-1">
        {user ? (
          <TorrentFavoriteButton
            torrentId={torrentId}
            initialFavorited={voteData.isFavorited}
            size={size}
            onToggle={handleFavoriteToggle}
          />
        ) : (
          <button
            type="button"
            disabled
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-text-muted cursor-not-allowed opacity-50"
            title="Login to favorite"
          >
            <HeartIcon size={size === 'sm' ? 14 : 18} />
          </button>
        )}
        <span className={`${textSize} text-text-muted`}>
          {voteData.favoritesCount}
        </span>
      </div>
    </div>
  );
}
