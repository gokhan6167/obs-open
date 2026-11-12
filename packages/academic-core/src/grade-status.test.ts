import { describe, expect, it } from 'vitest';
import {
  applyGradeTransition,
  GRADE_TRANSITIONS,
  gradeTransition,
  InvalidGradeTransitionError,
  isContentLocked,
} from './grade-status.js';

describe('not durum makinesi', () => {
  it('taslak->ilan->kesin geçerli', () => {
    expect(applyGradeTransition('draft', 'announced').action).toBe('ilan_et');
    expect(applyGradeTransition('announced', 'finalized').action).toBe('kesinlestir');
  });

  it('geçersiz geçiş hata', () => {
    expect(() => applyGradeTransition('draft', 'finalized')).toThrow(InvalidGradeTransitionError);
    expect(() => applyGradeTransition('finalized', 'draft')).toThrow(InvalidGradeTransitionError);
  });

  it('gradeTransition tanımsızda undefined', () => {
    expect(gradeTransition('announced', 'draft')).toBeUndefined();
  });

  it('içerik kilidi: ilan/kesin kilitli, taslak değil', () => {
    expect(isContentLocked('draft')).toBe(false);
    expect(isContentLocked('announced')).toBe(true);
    expect(isContentLocked('finalized')).toBe(true);
  });

  it('geçiş tablosu benzersiz', () => {
    const keys = GRADE_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
