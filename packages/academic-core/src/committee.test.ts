import { describe, expect, it } from 'vitest';
import { computeCommitteeYear, type CommitteeYearInput } from './committee.js';

function input(over: Partial<CommitteeYearInput>): CommitteeYearInput {
  return {
    committees: [
      { committeeId: 'k1', weight: 0.5, score: 70 },
      { committeeId: 'k2', weight: 0.5, score: 80 },
    ],
    generalExamScore: 60,
    committeesWeightInYear: 0.6,
    generalExamWeightInYear: 0.4,
    passingThreshold: 60,
    ...over,
  };
}

describe('computeCommitteeYear', () => {
  it('kurul ağırlıklı ortalama + genel sınav', () => {
    const r = computeCommitteeYear(input({}));
    // kurul ort = 70*0.5 + 80*0.5 = 75; yıl = 75*0.6 + 60*0.4 = 45 + 24 = 69
    expect(r.committeesAverage).toBe(75);
    expect(r.yearScore).toBeCloseTo(69, 6);
    expect(r.passed).toBe(true);
  });

  it('baraj altı geçmez', () => {
    const r = computeCommitteeYear(
      input({
        committees: [
          { committeeId: 'k1', weight: 0.5, score: 40 },
          { committeeId: 'k2', weight: 0.5, score: 50 },
        ],
        generalExamScore: 45,
      }),
    );
    // kurul ort 45; yıl = 45*0.6 + 45*0.4 = 45 < 60
    expect(r.passed).toBe(false);
  });

  it('boş kurul hata', () => {
    expect(() => computeCommitteeYear(input({ committees: [] }))).toThrow(RangeError);
  });

  it('kurul ağırlıkları toplamı 1 değilse hata', () => {
    expect(() =>
      computeCommitteeYear(
        input({ committees: [{ committeeId: 'k1', weight: 0.3, score: 70 }] }),
      ),
    ).toThrow(/Kurul ağırlıkları/);
  });

  it('yıl ağırlıkları toplamı 1 değilse hata', () => {
    expect(() =>
      computeCommitteeYear(input({ committeesWeightInYear: 0.5, generalExamWeightInYear: 0.4 })),
    ).toThrow(/Yıl ağırlıkları/);
  });

  it('geçersiz ağırlık aralığı hata', () => {
    expect(() =>
      computeCommitteeYear(input({ committeesWeightInYear: 1.5, generalExamWeightInYear: -0.5 })),
    ).toThrow(RangeError);
  });

  it('tek kurul, tam ağırlık', () => {
    const r = computeCommitteeYear(
      input({
        committees: [{ committeeId: 'k1', weight: 1, score: 90 }],
        generalExamScore: 70,
      }),
    );
    // kurul ort 90; yıl = 90*0.6 + 70*0.4 = 54 + 28 = 82
    expect(r.yearScore).toBeCloseTo(82, 6);
  });
});
