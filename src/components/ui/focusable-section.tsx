'use client';

/**
 * FocusableSection - Groups focusable items for spatial navigation
 *
 * Wraps a section of focusable items. The library tracks focus within
 * and between sections for intuitive navigation.
 */

import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import { cn } from '@/lib/utils';

interface FocusableSectionProps {
  children: React.ReactNode;
  focusKey: string;
  className?: string;
  /** Prefer this section to get initial focus */
  preferredChildFocusKey?: string;
}

export function FocusableSection({
  children,
  focusKey,
  className,
  preferredChildFocusKey,
}: FocusableSectionProps): React.ReactElement {
  const { ref, focusKey: currentFocusKey } = useFocusable({
    focusKey,
    preferredChildFocusKey,
    trackChildren: true,
    isFocusBoundary: false,
  });

  return (
    <FocusContext.Provider value={currentFocusKey}>
      <div ref={ref} className={cn(className)}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}
