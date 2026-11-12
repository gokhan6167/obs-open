import { describe, expect, it } from 'vitest';
import {
  checkDoubleMajorEligibility,
  type DoubleMajorEligibilityInput,
  type DoubleMajorRules,
} from './double-major.js';

const rules: DoubleMajorRules = {
  minGpaCap: 3.0,
  minGpaYandal: 2.5,
  minCompletedRatio: 0.25,
  maxCompletedRatio: 0.625,
};

function input(over: Partial<DoubleMajorEligibilityInput>): DoubleMajorEligibilityInput {
  return {
    type: 'cap',
    gpa: 3.2,
    completedTerms: 4,
    totalTerms: 8,
    hasDisciplinaryPenalty: false,
    rules,
    ...over,
  };
}

describe('checkDoubleMajorEligibility', () => {
  it('ÇAP: koşullar sağlanınca uygun', () => {
    const r = checkDoubleMajorEligibility(input({}));
    expect(r.eligible).toBe(true);
    expect(r.minGpa).toBe(3.0);
    expect(r.reasons).toHaveLength(0);
  });

  it('yandal: daha düşük GNO eşiği', () => {
    const r = checkDoubleMajorEligibility(input({ type: 'yandal', gpa: 2.6 }));
    expect(r.minGpa).toBe(2.5);
    expect(r.eligible).toBe(true);
  });

  it('düşük GNO -> uygun değil', () => {
    const r = checkDoubleMajorEligibility(input({ gpa: 2.8 }));
    expect(r.eligible).toBe(false);
    expect(r.reasons[0]).toMatch(/GNO yetersiz/);
  });

  it('çok erken başvuru -> uygun değil', () => {
    const r = checkDoubleMajorEligibility(input({ completedTerms: 1 }));
    expect(r.reasons.some((x) => /erken/.test(x))).toBe(true);
  });

  it('çok geç başvuru -> uygun değil', () => {
    const r = checkDoubleMajorEligibility(input({ completedTerms: 6 }));
    expect(r.reasons.some((x) => /geç/.test(x))).toBe(true);
  });

  it('disiplin cezası -> uygun değil', () => {
    const r = checkDoubleMajorEligibility(input({ hasDisciplinaryPenalty: true }));
    expect(r.reasons.some((x) => /Disiplin/.test(x))).toBe(true);
  });

  it('birden çok engel -> hepsi listelenir', () => {
    const r = checkDoubleMajorEligibility(input({ gpa: 2.0, hasDisciplinaryPenalty: true }));
    expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    expect(r.eligible).toBe(false);
  });

  it('totalTerms 0 -> hata', () => {
    expect(() => checkDoubleMajorEligibility(input({ totalTerms: 0 }))).toThrow(RangeError);
  });
});
