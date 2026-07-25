/**
 * useModalOpen tests
 *
 * The body class drives the global CSS that hides the floating feedback
 * button while a modal is open.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useModalOpen, MODAL_OPEN_CLASS } from './use-modal-open';

afterEach(() => {
  document.body.classList.remove(MODAL_OPEN_CLASS);
});

describe('useModalOpen', () => {
  it('does not mark body when closed', () => {
    renderHook(() => useModalOpen(false));
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(false);
  });

  it('marks body while open and clears it on close', () => {
    const { rerender } = renderHook(({ open }) => useModalOpen(open), {
      initialProps: { open: true },
    });
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(true);

    rerender({ open: false });
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(false);
  });

  it('clears the class on unmount', () => {
    const { unmount } = renderHook(() => useModalOpen(true));
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(true);

    unmount();
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(false);
  });

  it('keeps the class until the last stacked modal closes', () => {
    const outer = renderHook(() => useModalOpen(true));
    const inner = renderHook(() => useModalOpen(true));

    inner.unmount();
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(true);

    outer.unmount();
    expect(document.body.classList.contains(MODAL_OPEN_CLASS)).toBe(false);
  });
});
