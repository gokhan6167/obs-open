import { describe, expect, it } from 'vitest';
import { bandForLetter, bandForScore, resolveAttempt } from './grade-scale.js';
import type { GradeScale } from './types.js';

// ÖRNEK ölçek (VARSAYIM — docs/ASSUMPTIONS.md'de doğrulanacak). Kodda sabit değil.
const scale: GradeScale = {
  id: 'ornek-lisans',
  bands: [
    { letter: 'AA', minScore: 90, coefficient: 4.0, countsInGpa: true, isPassing: true },
    { letter: 'BA', minScore: 85, coefficient: 3.5, countsInGpa: true, isPassing: true },
    { letter: 'BB', minScore: 80, coefficient: 3.0, countsInGpa: true, isPassing: true },
    { letter: 'CB', minScore: 75, coefficient: 2.5, countsInGpa: true, isPassing: true },
    { letter: 'CC', minScore: 65, coefficient: 2.0, countsInGpa: true, isPassing: true },
    { letter: 'DC', minScore: 58, coefficient: 1.5, countsInGpa: true, isPassing: true },
    { letter: 'DD', minScore: 50, coefficient: 1.0, countsInGpa: true, isPassing: true },
    { letter: 'FF', minScore: 0, coefficient: 0.0, countsInGpa: true, isPassing: false },
    { letter: 'MU', minScore: -1, coefficient: 0.0, countsInGpa: false, isPassing: true },
  ],
};

describe('bandForScore', () => {
  it('puanı doğru banda eşler', () => {
    expect(bandForScore(scale, 95).letter).toBe('AA');
    expect(bandForScore(scale, 90).letter).toBe('AA');
    expect(bandForScore(scale, 89.9).letter).toBe('BA');
    expect(bandForScore(scale, 65).letter).toBe('CC');
    expect(bandForScore(scale, 0).letter).toBe('FF');
  });

  it('0-100 dışında hata verir', () => {
    expect(() => bandForScore(scale, -5)).toThrow(RangeError);
    expect(() => bandForScore(scale, 101)).toThrow(RangeError);
    expect(() => bandForScore(scale, Number.NaN)).toThrow(RangeError);
  });

  it('0 hiçbir bandı sağlamıyorsa hata verir', () => {
    const broken: GradeScale = {
      id: 'kirik',
      bands: [{ letter: 'AA', minScore: 90, coefficient: 4, countsInGpa: true, isPassing: true }],
    };
    expect(() => bandForScore(broken, 10)).toThrow();
  });
});

describe('bandForLetter', () => {
  it('harfin bandını bulur', () => {
    expect(bandForLetter(scale, 'AA').coefficient).toBe(4.0);
    expect(bandForLetter(scale, 'MU').countsInGpa).toBe(false);
  });

  it('bilinmeyen harfte hata verir', () => {
    expect(() => bandForLetter(scale, 'ZZ')).toThrow();
  });
});

describe('resolveAttempt', () => {
  it('harf notunu GNO denemesine çözer', () => {
    const a = resolveAttempt(scale, {
      courseCode: 'MAT101',
      credit: 6,
      letter: 'BA',
      termOrder: 1,
    });
    expect(a).toEqual({
      courseCode: 'MAT101',
      credit: 6,
      coefficient: 3.5,
      countsInGpa: true,
      termOrder: 1,
    });
  });
});
