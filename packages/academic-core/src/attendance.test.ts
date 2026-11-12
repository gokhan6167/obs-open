import { describe, expect, it } from 'vitest';
import { absencePct, evaluateAttendance, type AttendanceRules } from './attendance.js';

const rules: AttendanceRules = { maxAbsenceTheoryPct: 30, maxAbsencePracticePct: 20 };

describe('absencePct', () => {
  it('normal oran', () => {
    expect(absencePct(3, 10)).toBe(30);
  });
  it('toplam 0 -> 0', () => {
    expect(absencePct(0, 0)).toBe(0);
  });
});

describe('evaluateAttendance', () => {
  it('sınır altı -> NA değil', () => {
    const r = evaluateAttendance(
      { theoryTotal: 10, theoryAbsent: 3, practiceTotal: 10, practiceAbsent: 2 },
      rules,
    );
    expect(r.isNa).toBe(false);
  });

  it('teorik aşımı -> NA', () => {
    const r = evaluateAttendance(
      { theoryTotal: 10, theoryAbsent: 4, practiceTotal: 0, practiceAbsent: 0 },
      rules,
    );
    expect(r.theoryExceeded).toBe(true);
    expect(r.isNa).toBe(true);
  });

  it('uygulama aşımı -> NA', () => {
    const r = evaluateAttendance(
      { theoryTotal: 10, theoryAbsent: 1, practiceTotal: 10, practiceAbsent: 3 },
      rules,
    );
    expect(r.practiceExceeded).toBe(true);
    expect(r.isNa).toBe(true);
  });

  it('sınırda (eşit) aşım sayılmaz', () => {
    const r = evaluateAttendance(
      { theoryTotal: 10, theoryAbsent: 3, practiceTotal: 10, practiceAbsent: 2 },
      rules,
    );
    expect(r.theoryExceeded).toBe(false);
    expect(r.practiceExceeded).toBe(false);
  });
});
