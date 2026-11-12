import { describe, expect, it } from 'vitest';
import { matchReconciliation } from './reconciliation.js';

describe('matchReconciliation', () => {
  const payments = [
    { id: 'p1', amount: 100000 },
    { id: 'p2', amount: 50000 },
    { id: 'p3', amount: 100000 },
  ];

  it('tutara göre eşler; her ödeme bir kez kullanılır', () => {
    const r = matchReconciliation(
      [
        { bankRef: 'b1', amount: 100000 },
        { bankRef: 'b2', amount: 100000 },
      ],
      payments,
    );
    const ids = r.map((m) => m.matchedPaymentId);
    expect(ids).toContain('p1');
    expect(ids).toContain('p3');
    expect(new Set(ids).size).toBe(2); // aynı ödeme iki kez eşleşmez
  });

  it('eşleşmeyen banka kaydı istisna (null)', () => {
    const r = matchReconciliation([{ bankRef: 'b1', amount: 99999 }], payments);
    expect(r[0]!.matchedPaymentId).toBeNull();
  });

  it('boş girdi -> boş', () => {
    expect(matchReconciliation([], payments)).toEqual([]);
  });
});
