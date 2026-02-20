/**
 * Add Profile Button Component
 *
 * "+" button to add new profile
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AddProfileButtonProps {
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function AddProfileButton({
  size = 'lg',
  onClick,
  disabled = false,
  className,
}: AddProfileButtonProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24', 
    lg: 'w-32 h-32',
  };

  const iconSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Add Button Circle */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded-full border-2 border-dashed border-gray-500 bg-gray-900/50 flex items-center justify-center transition-all duration-200',
          'hover:border-white hover:bg-gray-800 hover:scale-105',
          'focus:outline-none focus:ring-2 focus:ring-white/50',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:border-gray-500 disabled:hover:bg-gray-900/50',
          sizeClasses[size]
        )}
      >
        <Plus
          className={cn(
            'text-gray-400 group-hover:text-white transition-colors duration-200',
            iconSizeClasses[size],
            disabled && 'text-gray-600'
          )}
        />
      </button>

      {/* Add Profile Text */}
      <div className="mt-3 text-center">
        <p
          className={cn(
            'text-gray-400 font-medium',
            textSizeClasses[size],
            disabled && 'text-gray-600'
          )}
        >
          Add Profile
        </p>
      </div>
    </div>
  );
}