'use client';

/**
 * Providers Component
 *
 * Client-side wrapper for all context providers.
 * This component wraps the app with necessary providers that need to persist
 * across routes.
 */

import { type ReactNode } from 'react';
import { PodcastPlayerProvider } from '@/contexts/podcast-player';
import { NowPlayingBar } from '@/components/podcasts/now-playing-bar';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): React.ReactElement {
  return (
    <PodcastPlayerProvider>
      {children}
      <NowPlayingBar />
    </PodcastPlayerProvider>
  );
}
