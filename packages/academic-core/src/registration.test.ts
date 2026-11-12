import { describe, expect, it } from 'vitest';
import {
  maxEctsForGpa,
  slotsOverlap,
  validateRegistration,
  type EctsRules,
  type RegistrationCandidate,
} from './registration.js';
import type { StudentContext } from './prerequisite.js';

const rules: EctsRules = {
  minEctsPerTerm: 30,
  maxEctsPerTerm: 45,
  gpaBoostThreshold: 3.0,
  maxEctsWithBoost: 51,
};

const student: StudentContext = {
  passedCourses: new Set(['MAT101']),
  earnedCredit: 60,
  gpa: 2.5,
};

function cand(over: Partial<RegistrationCandidate>): RegistrationCandidate {
  return { courseCode: 'X', ects: 6, slots: [], ...over };
}

describe('maxEctsForGpa', () => {
  it('GNO eşiğin altında normal limit', () => {
    expect(maxEctsForGpa(rules, 2.5)).toBe(45);
  });
  it('GNO eşikte/üstünde boost limit', () => {
    expect(maxEctsForGpa(rules, 3.0)).toBe(51);
    expect(maxEctsForGpa(rules, 3.8)).toBe(51);
  });
  it('boost parametresi yoksa normal limit', () => {
    expect(maxEctsForGpa({ minEctsPerTerm: 30, maxEctsPerTerm: 40 }, 4.0)).toBe(40);
  });
});

describe('slotsOverlap', () => {
  it('aynı gün çakışan aralıklar', () => {
    expect(slotsOverlap({ day: 1, startMin: 600, endMin: 690 }, { day: 1, startMin: 660, endMin: 750 })).toBe(
      true,
    );
  });
  it('farklı gün çakışmaz', () => {
    expect(slotsOverlap({ day: 1, startMin: 600, endMin: 690 }, { day: 2, startMin: 600, endMin: 690 })).toBe(
      false,
    );
  });
  it('bitişik aralıklar çakışmaz ([start,end))', () => {
    expect(slotsOverlap({ day: 1, startMin: 600, endMin: 660 }, { day: 1, startMin: 660, endMin: 720 })).toBe(
      false,
    );
  });
});

describe('validateRegistration', () => {
  it('geçerli sepet -> ok', () => {
    const r = validateRegistration({
      candidates: [cand({ courseCode: 'A', ects: 6 }), cand({ courseCode: 'B', ects: 6 })],
      rules,
      gpa: 2.5,
      student,
    });
    expect(r.ok).toBe(true);
    expect(r.totalEcts).toBe(12);
    expect(r.maxEcts).toBe(45);
  });

  it('üst AKTS aşımı -> ects_over', () => {
    const r = validateRegistration({
      candidates: [cand({ courseCode: 'A', ects: 40 }), cand({ courseCode: 'B', ects: 10 })],
      rules,
      gpa: 2.5,
      student,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.type === 'ects_over')).toBe(true);
  });

  it('enforceMin ile alt AKTS -> ects_under', () => {
    const r = validateRegistration({
      candidates: [cand({ courseCode: 'A', ects: 10 })],
      rules,
      gpa: 2.5,
      student,
      enforceMin: true,
    });
    expect(r.violations.some((v) => v.type === 'ects_under')).toBe(true);
  });

  it('ders çakışması -> conflict', () => {
    const r = validateRegistration({
      candidates: [
        cand({ courseCode: 'A', ects: 6, slots: [{ day: 1, startMin: 600, endMin: 690 }] }),
        cand({ courseCode: 'B', ects: 6, slots: [{ day: 1, startMin: 660, endMin: 750 }] }),
      ],
      rules,
      gpa: 2.5,
      student,
    });
    expect(r.violations.some((v) => v.type === 'conflict')).toBe(true);
  });

  it('ön koşul sağlanmıyor -> prerequisite', () => {
    const r = validateRegistration({
      candidates: [
        cand({ courseCode: 'B', ects: 6, prerequisite: { type: 'course', courseCode: 'KIM101' } }),
      ],
      rules,
      gpa: 2.5,
      student,
    });
    expect(r.violations.some((v) => v.type === 'prerequisite')).toBe(true);
  });

  it('ön koşul sağlanıyor -> ihlal yok', () => {
    const r = validateRegistration({
      candidates: [
        cand({ courseCode: 'B', ects: 6, prerequisite: { type: 'course', courseCode: 'MAT101' } }),
      ],
      rules,
      gpa: 2.5,
      student,
    });
    expect(r.ok).toBe(true);
  });
});
