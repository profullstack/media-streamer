'use client';

/**
 * Go Live: broadcast your own camera or screen on c0mpute Live.
 * A paid-plan feature; the proxy has already checked the plan.
 */

import { MainLayout } from '@/components/layout';
import { GoLive } from '@/components/live/go-live';

export default function LivePage(): React.ReactElement {
  return (
    <MainLayout>
      <GoLive />
    </MainLayout>
  );
}
