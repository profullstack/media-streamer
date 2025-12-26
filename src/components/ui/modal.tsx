'use client';

/**
 * Modal Component
 * 
 * Reusable modal dialog with backdrop and animations.
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
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div
        className={cn(
          'relative w-full animate-scale-in rounded-xl bg-bg-secondary shadow-2xl',
          sizeClasses[size],
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
            <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              aria-label="Close modal"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={cn('p-6', !title && 'pt-4')}>{children}</div>
      </div>
    </div>
  );
}
