'use client';

import { createContext, useContext } from 'react';

/**
 * Carries the server-rendered SiteFooter (site-footer.tsx) from the root layout to
 * client layouts such as MainLayout, which cannot render an async server component.
 */
const SiteFooterContext = createContext<React.ReactNode>(null);

export function SiteFooterProvider({ footer, children }: { footer: React.ReactNode; children: React.ReactNode }): React.ReactNode {
  return <SiteFooterContext.Provider value={footer}>{children}</SiteFooterContext.Provider>;
}

export function useSiteFooter(): React.ReactNode {
  return useContext(SiteFooterContext);
}
