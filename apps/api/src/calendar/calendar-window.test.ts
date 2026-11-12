import { describe, expect, it } from 'vitest';
import { isEventOpen, isWithinWindow, type CalendarWindow } from './calendar-window.js';

const windows: CalendarWindow[] = [
  { type: 'kayit', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-08T00:00:00Z' },
  { type: 'ekle_sil', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-12T00:00:00Z' },
];

describe('isWithinWindow', () => {
  it('[start, end) aralığını uygular (start dahil, end hariç)', () => {
    const w = windows[0]!;
    expect(isWithinWindow('2026-09-01T00:00:00Z', w)).toBe(true);
    expect(isWithinWindow('2026-09-05T12:00:00Z', w)).toBe(true);
    expect(isWithinWindow('2026-09-08T00:00:00Z', w)).toBe(false);
    expect(isWithinWindow('2026-08-31T23:59:59Z', w)).toBe(false);
  });
});

describe('isEventOpen', () => {
  it('doğru tip + zamanda açık', () => {
    expect(isEventOpen(windows, 'kayit', '2026-09-03T00:00:00Z')).toBe(true);
    expect(isEventOpen(windows, 'ekle_sil', '2026-09-03T00:00:00Z')).toBe(false);
    expect(isEventOpen(windows, 'kayit', '2026-10-01T00:00:00Z')).toBe(false);
    expect(isEventOpen(windows, 'mazeret', '2026-09-03T00:00:00Z')).toBe(false);
  });
});
