'use client';

/**
 * Media Placeholder Component
 *
 * Displays a placeholder image with appropriate icon based on content type.
 * Handles image loading errors gracefully by showing the placeholder.
 */

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { MusicIcon, VideoIcon, BookIcon, FolderIcon, TvIcon } from './icons';

/**
 * Content types that determine the placeholder icon
 */
export type MediaContentType = 'music' | 'movie' | 'tvshow' | 'book' | 'ebook' | 'video' | 'audio' | 'xxx' | 'other' | null | undefined;

/**
 * Aspect ratio presets for different media types
 */
export type MediaAspectRatio = 'square' | 'poster' | 'landscape';

interface MediaPlaceholderProps {
  /** Image URL to display (if available) */
  src?: string | null;
  /** Alt text for the image */
  alt: string;
  /** Content type to determine placeholder icon */
  contentType?: MediaContentType;
  /** Aspect ratio of the container */
  aspectRatio?: MediaAspectRatio;
  /** Size preset or custom dimensions */
  size?: 'sm' | 'md' | 'lg' | 'xl' | { width: number; height: number };
  /** Additional CSS classes */
  className?: string;
  /** Whether to use Next.js Image optimization */
  optimized?: boolean;
}

/**
 * Get the appropriate icon component based on content type
 */
function getIconForContentType(contentType: MediaContentType): React.ComponentType<{ className?: string; size?: number }> {
  switch (contentType) {
    case 'music':
    case 'audio':
      return MusicIcon;
    case 'movie':
    case 'video':
      return VideoIcon;
    case 'tvshow':
      return TvIcon;
    case 'book':
    case 'ebook':
      return BookIcon;
    default:
      return FolderIcon;
  }
}

/**
 * Get the background color class based on content type
 */
function getBackgroundColorClass(contentType: MediaContentType): string {
  switch (contentType) {
    case 'music':
    case 'audio':
      return 'bg-accent-audio/20';
    case 'movie':
    case 'video':
    case 'tvshow':
      return 'bg-accent-video/20';
    case 'book':
    case 'ebook':
      return 'bg-accent-ebook/20';
    default:
      return 'bg-accent-primary/20';
  }
}

/**
 * Get the icon color class based on content type
 */
function getIconColorClass(contentType: MediaContentType): string {
  switch (contentType) {
    case 'music':
    case 'audio':
      return 'text-accent-audio';
    case 'movie':
    case 'video':
    case 'tvshow':
      return 'text-accent-video';
    case 'book':
    case 'ebook':
      return 'text-accent-ebook';
    default:
      return 'text-accent-primary';
  }
}

/**
 * Get dimensions based on size preset and aspect ratio
 */
function getDimensions(
  size: MediaPlaceholderProps['size'],
  aspectRatio: MediaAspectRatio
): { width: string; height: string; iconSize: number } {
  // Custom dimensions
  if (typeof size === 'object') {
    return {
      width: `${size.width}px`,
      height: `${size.height}px`,
      iconSize: Math.min(size.width, size.height) * 0.4,
    };
  }

  // Preset sizes with aspect ratio consideration
  const presets = {
    sm: { square: { w: 48, h: 48 }, poster: { w: 48, h: 72 }, landscape: { w: 72, h: 48 } },
    md: { square: { w: 80, h: 80 }, poster: { w: 80, h: 120 }, landscape: { w: 120, h: 80 } },
    lg: { square: { w: 128, h: 128 }, poster: { w: 128, h: 192 }, landscape: { w: 192, h: 128 } },
    xl: { square: { w: 192, h: 192 }, poster: { w: 192, h: 288 }, landscape: { w: 288, h: 192 } },
  };

  const preset = presets[size ?? 'md'][aspectRatio];
  return {
    width: `${preset.w}px`,
    height: `${preset.h}px`,
    iconSize: Math.min(preset.w, preset.h) * 0.4,
  };
}

/**
 * MediaPlaceholder component
 *
 * Displays an image with a fallback placeholder that shows an appropriate icon
 * based on the content type. Handles image loading errors gracefully.
 */
export function MediaPlaceholder({
  src,
  alt,
  contentType,
  aspectRatio = 'poster',
  size = 'md',
  className,
  optimized = false,
}: MediaPlaceholderProps): React.ReactElement {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!src);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const dimensions = getDimensions(size, aspectRatio);
  const IconComponent = getIconForContentType(contentType);
  const bgColorClass = getBackgroundColorClass(contentType);
  const iconColorClass = getIconColorClass(contentType);

  const showPlaceholder = !src || hasError;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg',
        showPlaceholder && bgColorClass,
        className
      )}
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {/* Loading skeleton */}
      {isLoading && !showPlaceholder && (
        <div className="absolute inset-0 animate-pulse bg-bg-tertiary" />
      )}

      {/* Image */}
      {src && !hasError && (
        optimized ? (
          <Image
            src={src}
            alt={alt}
            fill
            sizes={dimensions.width}
            className={cn(
              'object-cover transition-opacity duration-200',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onError={handleError}
            onLoad={handleLoad}
            unoptimized
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onError={handleError}
            onLoad={handleLoad}
          />
        )
      )}

      {/* Placeholder */}
      {showPlaceholder && (
        <div className="flex h-full w-full items-center justify-center">
          <IconComponent
            className={iconColorClass}
            size={dimensions.iconSize}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Thumbnail variant for list views
 */
export function MediaThumbnail({
  src,
  alt,
  contentType,
  className,
}: Omit<MediaPlaceholderProps, 'size' | 'aspectRatio'>): React.ReactElement {
  // Use square aspect ratio for music, poster for everything else
  const aspectRatio: MediaAspectRatio = 
    contentType === 'music' || contentType === 'audio' ? 'square' : 'poster';
  
  return (
    <MediaPlaceholder
      src={src}
      alt={alt}
      contentType={contentType}
      aspectRatio={aspectRatio}
      size="sm"
      className={className}
    />
  );
}

/**
 * Detail page variant with larger size
 * Always uses poster (rectangular) aspect ratio for all content types
 * including music discographies which have artist images
 */
export function MediaPoster({
  src,
  alt,
  contentType,
  className,
}: Omit<MediaPlaceholderProps, 'size' | 'aspectRatio'>): React.ReactElement {
  // Always use poster (rectangular) aspect ratio for detail pages
  // Music discographies have artist images which look better in poster format
  return (
    <MediaPlaceholder
      src={src}
      alt={alt}
      contentType={contentType}
      aspectRatio="poster"
      size="lg"
      className={className}
    />
  );
}
