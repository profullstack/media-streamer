'use client';

/**
 * TV Layout Provider
 *
 * Detects TV browsers (Amazon Silk, Fire TV, Android TV, etc.) and applies
 * the 'tv' class to the html element to enable TV-specific styling.
 *
 * This component should wrap the entire app in the root layout to ensure
 * TV detection happens early and styles are applied globally.
 */

import { useEffect } from 'react';
import { useTvDetection } from '@/hooks';

interface TvLayoutProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that detects TV browsers and applies TV-specific styling
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <TvLayoutProvider>
 *           {children}
 *         </TvLayoutProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function TvLayoutProvider({ children }: TvLayoutProviderProps): React.ReactElement {
  const { isTv, browserType } = useTvDetection();

  useEffect(() => {
    // Apply or remove the 'tv' class on the html element
    const htmlElement = document.documentElement;

    if (isTv) {
      htmlElement.classList.add('tv');

      // Also add specific browser type class for more targeted styling if needed
      if (browserType) {
        htmlElement.classList.add(`tv-${browserType}`);
      }

      // Log for debugging in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TvLayoutProvider] TV browser detected: ${browserType}`);
      }
    } else {
      htmlElement.classList.remove('tv');

      // Remove all TV browser type classes
      const tvClasses = Array.from(htmlElement.classList).filter((cls) =>
        cls.startsWith('tv-')
      );
      tvClasses.forEach((cls) => htmlElement.classList.remove(cls));
    }

    // Cleanup on unmount
    return () => {
      htmlElement.classList.remove('tv');
      const tvClasses = Array.from(htmlElement.classList).filter((cls) =>
        cls.startsWith('tv-')
      );
      tvClasses.forEach((cls) => htmlElement.classList.remove(cls));
    };
  }, [isTv, browserType]);

  return <>{children}</>;
}
