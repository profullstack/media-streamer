'use client';

/**
 * Modal Component
 *
 * Reusable modal dialog with backdrop and animations.
 * Optimized for various screen sizes including TV browsers (Silk, etc.)
 */

import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CloseIcon } from './icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
}

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

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  size = 'md',
}: ModalProps): React.ReactElement | null {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content - constrained to viewport with margin, optimized for TV browsers */}
      <div
        className={cn(
          'relative w-full animate-scale-in rounded-lg sm:rounded-xl bg-bg-secondary shadow-2xl',
          // Use dvh (dynamic viewport height) for better TV/mobile browser support
          // Falls back to vh for browsers that don't support dvh
          'max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] lg:max-h-[calc(100dvh-4rem)]',
          'flex flex-col overflow-hidden',
          sizeClasses[size],
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header - fixed at top, compact for TV */}
        {title ? <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4 flex-shrink-0">
            <h2 id="modal-title" className="text-sm sm:text-base md:text-lg font-semibold text-text-primary truncate pr-2">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 sm:p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary flex-shrink-0 focus:ring-2 focus:ring-accent-primary focus:outline-none"
              aria-label="Close modal"
            >
              <CloseIcon size={20} className="sm:w-5 sm:h-5 md:w-6 md:h-6" />
            </button>
          </div> : null}

        {/* Body - scrollable with hidden scrollbar option for cleaner TV UI */}
        <div className={cn('p-3 sm:p-4 md:p-6 overflow-y-auto flex-1 overscroll-contain', !title && 'pt-3 sm:pt-4')}>{children}</div>
      </div>
    </div>
  );
}
