import { describe, expect, it } from 'vitest';
import { computeTuition, type TuitionInput } from './pricing.js';

function input(over: Partial<TuitionInput>): TuitionInput {
  return { baseAmount: 100000, scholarshipRate: 0, discounts: [], installments: 1, ...over };
}

describe('computeTuition', () => {
  it('burs/indirim yoksa brüt = net', () => {
    const r = computeTuition(input({ baseAmount: 120000 }));
    expect(r.net).toBe(120000);
    expect(r.installments).toEqual([{ no: 1, amount: 120000 }]);
  });

  it('burs oranı uygulanır', () => {
    const r = computeTuition(input({ baseAmount: 100000, scholarshipRate: 0.5 }));
    expect(r.afterScholarship).toBe(50000);
    expect(r.net).toBe(50000);
  });

  it('sıralı indirimler kalan üzerinden', () => {
    // 100000 -> burs %0 -> 100000; erken %10 -> 90000; kardeş %5 -> 85500
    const r = computeTuition(
      input({
        baseAmount: 100000,
        discounts: [
          { type: 'erken', rate: 0.1 },
          { type: 'kardes', rate: 0.05 },
        ],
      }),
    );
    expect(r.net).toBe(85500);
  });

  it('taksit toplamı net e tam eşit (artık ilk taksitte)', () => {
    const r = computeTuition(input({ baseAmount: 100003, installments: 3 }));
    const sum = r.installments.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(r.net);
    expect(r.installments).toHaveLength(3);
    // 100003 / 3 = 33334 taban, artık 1 -> ilk taksit 33335
    expect(r.installments[0]!.amount).toBe(33335);
    expect(r.installments[1]!.amount).toBe(33334);
  });

  it('yuvarlama kuruş tam sayı kalır', () => {
    const r = computeTuition(input({ baseAmount: 100001, scholarshipRate: 0.33 }));
    expect(Number.isInteger(r.afterScholarship)).toBe(true);
    expect(Number.isInteger(r.net)).toBe(true);
  });

  it('geçersiz girdiler hata', () => {
    expect(() => computeTuition(input({ baseAmount: -1 }))).toThrow(RangeError);
    expect(() => computeTuition(input({ baseAmount: 100.5 }))).toThrow(RangeError);
    expect(() => computeTuition(input({ installments: 0 }))).toThrow(RangeError);
    expect(() => computeTuition(input({ scholarshipRate: 1.5 }))).toThrow(RangeError);
    expect(() => computeTuition(input({ discounts: [{ type: 'x', rate: 2 }] }))).toThrow(RangeError);
  });
});
