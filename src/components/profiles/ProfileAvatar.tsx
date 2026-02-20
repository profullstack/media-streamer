/**
 * Profile Avatar Component
 *
 * Single profile card showing emoji/image avatar and name below
 */

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface ProfileAvatarProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
  isDefault?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: (profileId: string) => void;
  className?: string;
}

export function ProfileAvatar({
  id,
  name,
  avatarUrl,
  avatarEmoji,
  isDefault = false,
  size = 'lg',
  onClick,
  className,
}: ProfileAvatarProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24', 
    lg: 'w-32 h-32',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const emojiSizeClasses = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-6xl',
  };

  // Generate initials from name
  const initials = name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Generate a consistent color based on name
  const colors = [
    'bg-red-500',
    'bg-blue-500', 
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  const colorIndex = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length;
  const backgroundColor = colors[colorIndex];

  const handleClick = () => {
    if (onClick) {
      onClick(id);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center cursor-pointer group transition-all duration-200 hover:scale-105',
        className
      )}
      onClick={handleClick}
    >
      {/* Avatar Circle */}
      <div
        className={cn(
          'rounded-full border-4 border-transparent group-hover:border-white/50 transition-all duration-200 relative overflow-hidden',
          sizeClasses[size],
          isDefault && 'ring-2 ring-blue-400'
        )}
      >
        {avatarUrl ? (
          // Custom avatar image
          <Image
            src={avatarUrl}
            alt={`${name} avatar`}
            fill
            className="object-cover"
            sizes={size === 'lg' ? '128px' : size === 'md' ? '96px' : '64px'}
          />
        ) : avatarEmoji ? (
          // Emoji avatar
          <div
            className={cn(
              'w-full h-full flex items-center justify-center bg-gray-800',
              emojiSizeClasses[size]
            )}
          >
            {avatarEmoji}
          </div>
        ) : (
          // Default initials avatar
          <div
            className={cn(
              'w-full h-full flex items-center justify-center text-white font-bold',
              backgroundColor,
              emojiSizeClasses[size]
            )}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Profile Name */}
      <div className="mt-3 text-center">
        <p
          className={cn(
            'text-white font-medium group-hover:text-gray-200 transition-colors duration-200',
            textSizeClasses[size]
          )}
        >
          {name}
        </p>
        {isDefault && (
          <p className="text-xs text-blue-400 mt-1">Default</p>
        )}
      </div>
    </div>
  );
}