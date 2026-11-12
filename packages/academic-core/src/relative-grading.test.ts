import { describe, expect, it } from 'vitest';
import {
  assignRelative,
  letterForTScore,
  mean,
  populationStdDev,
  tScore,
  type RelativeBand,
} from './relative-grading.js';

const bands: RelativeBand[] = [
  { letter: 'AA', minTScore: 65, coefficient: 4.0, isPassing: true },
  { letter: 'BB', minTScore: 55, coefficient: 3.0, isPassing: true },
  { letter: 'CC', minTScore: 45, coefficient: 2.0, isPassing: true },
  { letter: 'DD', minTScore: 35, coefficient: 1.0, isPassing: true },
  { letter: 'FF', minTScore: 0, coefficient: 0.0, isPassing: false },
];

describe('mean / populationStdDev', () => {
  it('mean doğru', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });
  it('std: bilinen değer', () => {
    // [2,4,4,4,5,5,7,9] popülasyon std = 2
    expect(populationStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it('std: tümü eşit -> 0', () => {
    expect(populationStdDev([50, 50, 50])).toBe(0);
  });
  it('boş dizi hata', () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => populationStdDev([])).toThrow(RangeError);
  });
});

describe('tScore', () => {
  it('ortalamada 50', () => {
    expect(tScore(20, 20, 5)).toBe(50);
  });
  it('bir std üstü 60', () => {
    expect(tScore(25, 20, 5)).toBe(60);
  });
  it('std 0 -> herkes 50', () => {
    expect(tScore(80, 50, 0)).toBe(50);
  });
});

describe('letterForTScore', () => {
  it('doğru bandı bulur', () => {
    expect(letterForTScore(bands, 70).letter).toBe('AA');
    expect(letterForTScore(bands, 55).letter).toBe('BB');
    expect(letterForTScore(bands, 0).letter).toBe('FF');
  });
  it('kapsanmayan (negatif) -> hata', () => {
    const partial: RelativeBand[] = [{ letter: 'AA', minTScore: 65, coefficient: 4, isPassing: true }];
    expect(() => letterForTScore(partial, 10)).toThrow();
  });
});

describe('assignRelative', () => {
  it('boş -> boş', () => {
    expect(assignRelative([], { bands })).toEqual([]);
  });

  it('çan ile harflendirir; en yüksek ham en yüksek T', () => {
    const res = assignRelative(
      [
        { studentId: 'a', raw: 90 },
        { studentId: 'b', raw: 50 },
        { studentId: 'c', raw: 30 },
      ],
      { bands },
    );
    const a = res.find((r) => r.studentId === 'a')!;
    const c = res.find((r) => r.studentId === 'c')!;
    expect(a.tScore).toBeGreaterThan(c.tScore);
    // En yüksek ham puanın katsayısı en düşüğünkinden düşük olamaz.
    expect(a.coefficient).toBeGreaterThanOrEqual(c.coefficient);
  });

  it('ham puan barajı altı doğrudan başarısız (çan taşıyamaz)', () => {
    const res = assignRelative(
      [
        { studentId: 'a', raw: 40 },
        { studentId: 'b', raw: 42 },
        { studentId: 'c', raw: 44 },
      ],
      { bands, passingRawFloor: 45, failLetter: 'FF', failCoefficient: 0 },
    );
    // Hepsi baraj altı -> hepsi FF, T-skoru yüksek olsa bile
    expect(res.every((r) => r.letter === 'FF')).toBe(true);
  });

  it('baraj varsayılan failLetter FF', () => {
    const res = assignRelative([{ studentId: 'a', raw: 10 }], { bands, passingRawFloor: 50 });
    expect(res[0]!.letter).toBe('FF');
    expect(res[0]!.coefficient).toBe(0);
  });

  it('tümü eşit puanda herkes 50 T ve aynı harf', () => {
    const res = assignRelative(
      [
        { studentId: 'a', raw: 60 },
        { studentId: 'b', raw: 60 },
      ],
      { bands },
    );
    expect(res.every((r) => r.tScore === 50)).toBe(true);
    expect(res[0]!.letter).toBe(res[1]!.letter);
  });
});
