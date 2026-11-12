import { describe, expect, it } from 'vitest';
import { selectEffective, type EffectiveScoped } from './effective.js';

interface Row extends EffectiveScoped {
  tag: string;
}

const PROG = 'prog-1';

describe('selectEffective', () => {
  it('yürürlük tarihi dışındakileri eler', () => {
    const rows: Row[] = [
      { tag: 'gelecek', programId: null, effectiveFrom: '2027-01-01', effectiveTo: null },
      { tag: 'gecmis', programId: null, effectiveFrom: '2020-01-01', effectiveTo: '2021-01-01' },
    ];
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-07-16' })).toBeUndefined();
  });

  it('program-özel kayıt tenant-geneline baskın', () => {
    const rows: Row[] = [
      { tag: 'genel', programId: null, effectiveFrom: '2023-01-01', effectiveTo: null },
      { tag: 'program', programId: PROG, effectiveFrom: '2023-01-01', effectiveTo: null },
    ];
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-07-16' })?.tag).toBe('program');
  });

  it('eşit spesifiklikte en yeni effectiveFrom kazanır', () => {
    const rows: Row[] = [
      { tag: 'eski', programId: null, effectiveFrom: '2022-01-01', effectiveTo: null },
      { tag: 'yeni', programId: null, effectiveFrom: '2025-01-01', effectiveTo: null },
    ];
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-07-16' })?.tag).toBe('yeni');
  });

  it('başka programın kaydını seçmez', () => {
    const rows: Row[] = [
      { tag: 'baska', programId: 'prog-2', effectiveFrom: '2023-01-01', effectiveTo: null },
    ];
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-07-16' })).toBeUndefined();
  });

  it('sınır: effectiveFrom dahil, effectiveTo hariç', () => {
    const rows: Row[] = [
      { tag: 'aralik', programId: null, effectiveFrom: '2026-07-16', effectiveTo: '2026-12-31' },
    ];
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-07-16' })?.tag).toBe('aralik');
    expect(selectEffective(rows, { programId: PROG, onDate: '2026-12-31' })).toBeUndefined();
  });

  it('aday yoksa undefined', () => {
    expect(selectEffective([], { programId: PROG, onDate: '2026-07-16' })).toBeUndefined();
  });
});
