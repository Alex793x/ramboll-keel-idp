import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { formatClock, useClock } from './useClock';

describe('formatClock', () => {
  it('formats as HH:MM:SS CET with two-digit padding', () => {
    expect(formatClock(new Date(2026, 0, 5, 9, 8, 7))).toBe('09:08:07 CET');
  });

  it('pads midnight to 00:00:00', () => {
    expect(formatClock(new Date(2026, 0, 5, 0, 0, 0))).toBe('00:00:00 CET');
  });

  it('leaves two-digit parts untouched', () => {
    expect(formatClock(new Date(2026, 0, 5, 23, 59, 58))).toBe('23:59:58 CET');
  });
});

describe('useClock', () => {
  it("starts empty, ticks every 1000ms, and cleans up its interval", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 0, 5, 12, 34, 55));
      const { result, unmount } = renderHook(() => useClock());

      // Design source starts with clock: '' and only populates on the first tick.
      expect(result.current).toBe('');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe('12:34:56 CET');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe('12:34:57 CET');

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
