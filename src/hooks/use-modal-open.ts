'use client';

/**
 * useModalOpen
 *
 * Marks <body> while a modal/overlay is open so global CSS can hide
 * page-level chrome that would otherwise sit on top of it — notably the
 * floating feedback button (`#pf-fab`), which covers the video player's
 * fullscreen/maximize control in the lower-right corner on TV screens.
 *
 * Ref-counted so stacked modals (e.g. a confirm dialog over a player) keep
 * the class until the last one closes.
 */

import { useEffect } from 'react';

/** Class toggled on <body> while at least one modal is open. */
export const MODAL_OPEN_CLASS = 'modal-open';

let openCount = 0;

export function useModalOpen(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;

    openCount += 1;
    document.body.classList.add(MODAL_OPEN_CLASS);

    return (): void => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) {
        document.body.classList.remove(MODAL_OPEN_CLASS);
      }
    };
  }, [isOpen]);
}
