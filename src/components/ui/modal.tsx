'use client';

/**
 * Modal Component
 *
 * Reusable modal dialog with backdrop and animations.
 * Optimized for various screen sizes including TV browsers (Silk, etc.)
 * Automatically scales down on TV browsers to prevent scrolling.
 */

import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CloseIcon } from './icons';
import { useTvDetection } from '@/hooks/use-tv-detection';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
}

// Standard size classes for desktop/mobile
const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'max-w-[95vw]',
};

// Smaller size classes for TV browsers to prevent scrolling
const tvSizeClasses = {
  sm: 'max-w-xs',      // sm -> xs
  md: 'max-w-sm',      // md -> sm
  lg: 'max-w-md',      // lg -> md
  xl: 'max-w-lg',      // xl -> lg
  '2xl': 'max-w-xl',   // 2xl -> xl
  '3xl': 'max-w-2xl',  // 3xl -> 2xl
  '4xl': 'max-w-3xl',  // 4xl -> 3xl
  full: 'max-w-[85vw]', // full -> 85vw
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  size = 'md',
}: ModalProps): React.ReactElement | null {
  const { isTv } = useTvDetection();
  
  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  // Use smaller sizes on TV browsers to prevent scrolling
  const activeSizeClasses = isTv ? tvSizeClasses : sizeClasses;

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center',
      // Smaller padding on TV to maximize usable space
      isTv ? 'p-1' : 'p-2 sm:p-4 md:p-6 lg:p-8'
    )}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content - constrained to viewport with margin, optimized for TV browsers */}
      <div
        data-testid="modal-content"
        className={cn(
          'relative w-full animate-scale-in rounded-lg sm:rounded-xl bg-bg-secondary shadow-2xl',
          // Use dvh (dynamic viewport height) for better TV/mobile browser support
          // Falls back to vh for browsers that don't support dvh
          // Smaller max-height on TV to ensure modal fits without scrolling
          isTv
            ? 'max-h-[calc(100dvh-0.5rem)]'
            : 'max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] lg:max-h-[calc(100dvh-4rem)]',
          'flex flex-col overflow-hidden',
          activeSizeClasses[size],
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header - fixed at top, compact for TV */}
        {title ? <div
            data-testid="modal-header"
            className={cn(
              'flex items-center justify-between border-b border-border-subtle flex-shrink-0',
              // Smaller padding on TV
              isTv ? 'px-2 py-1' : 'px-3 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4'
            )}
          >
            <h2
              id="modal-title"
              className={cn(
                'font-semibold text-text-primary truncate pr-2',
                // Smaller text on TV
                isTv ? 'text-sm' : 'text-sm sm:text-base md:text-lg'
              )}
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'rounded-lg text-text-secondary hover:bg-bg-hover hover:text-text-primary flex-shrink-0 focus:ring-2 focus:ring-accent-primary focus:outline-none',
                // Smaller button on TV
                isTv ? 'p-0.5' : 'p-1 sm:p-1.5'
              )}
              aria-label="Close modal"
            >
              <CloseIcon size={isTv ? 16 : 20} className={isTv ? '' : 'sm:w-5 sm:h-5 md:w-6 md:h-6'} />
            </button>
          </div> : null}

        {/* Body - scrollable with hidden scrollbar option for cleaner TV UI */}
        <div className={cn(
          'overflow-y-auto flex-1 overscroll-contain',
          // Smaller padding on TV
          isTv ? 'p-2' : 'p-3 sm:p-4 md:p-6',
          !title && (isTv ? 'pt-2' : 'pt-3 sm:pt-4')
        )}>{children}</div>
      </div>
    </div>
  );
}
