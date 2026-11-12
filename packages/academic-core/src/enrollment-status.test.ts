import { describe, expect, it } from 'vitest';
import {
  applyEnrollmentTransition,
  ENROLLMENT_TRANSITIONS,
  enrollmentTransition,
  InvalidEnrollmentTransitionError,
  isTerminalEnrollment,
} from './enrollment-status.js';

describe('kayıt durum makinesi', () => {
  it('danışman onay yolu: draft->submitted->approved', () => {
    expect(applyEnrollmentTransition('draft', 'submitted').action).toBe('gonder');
    expect(applyEnrollmentTransition('submitted', 'approved').action).toBe('danisman_onayla');
  });

  it('ret ve çekilme koltuğu iade eder', () => {
    expect(applyEnrollmentTransition('submitted', 'rejected').releasesSeat).toBe(true);
    expect(applyEnrollmentTransition('approved', 'withdrawn').releasesSeat).toBe(true);
    expect(applyEnrollmentTransition('draft', 'withdrawn').releasesSeat).toBe(true);
  });

  it('onay koltuğu iade etmez', () => {
    expect(applyEnrollmentTransition('submitted', 'approved').releasesSeat).toBe(false);
  });

  it('geçersiz geçiş hata fırlatır', () => {
    expect(() => applyEnrollmentTransition('draft', 'approved')).toThrow(
      InvalidEnrollmentTransitionError,
    );
    expect(() => applyEnrollmentTransition('withdrawn', 'draft')).toThrow(
      InvalidEnrollmentTransitionError,
    );
  });

  it('enrollmentTransition tanımsızda undefined', () => {
    expect(enrollmentTransition('approved', 'submitted')).toBeUndefined();
  });

  it('withdrawn nihai durum', () => {
    expect(isTerminalEnrollment('withdrawn')).toBe(true);
    expect(isTerminalEnrollment('approved')).toBe(false);
  });

  it('geçiş tablosu benzersiz (from+to)', () => {
    const keys = ENROLLMENT_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
