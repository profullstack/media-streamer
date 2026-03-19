'use client';

/**
 * Focusable - Wrapper for spatial navigation focus
 *
 * Wraps any element to make it focusable via arrow key / D-pad navigation.
 * On focus, adds a visible ring. On Enter/click, triggers onPress.
 * Touch/mouse still works as normal.
 */

import { useCallback } from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { cn } from '@/lib/utils';

interface FocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onFocus?: () => void;
  className?: string;
  focusClassName?: string;
  focusKey?: string;
  /** Render as a specific element type */
  as?: 'div' | 'li' | 'button' | 'a';
}

export function Focusable({
  children,
  onPress,
  onFocus,
  className,
  focusClassName = 'ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-primary',
  focusKey,
  as: Component = 'div',
}: FocusableProps): React.ReactElement {
  const { ref, focused } = useFocusable({
    onEnterPress: onPress,
    onFocus: onFocus ? () => onFocus() : undefined,
    focusKey,
  });

  const handleClick = useCallback(() => {
    if (onPress) onPress();
  }, [onPress]);

  return (
    <Component
      ref={ref}
      className={cn(
        'outline-none transition-shadow duration-150',
        focused && focusClassName,
        className,
      )}
      onClick={handleClick}
      tabIndex={-1}
    >
      {children}
    </Component>
  );
}
