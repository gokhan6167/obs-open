import { describe, expect, it } from 'vitest';
import { validateGradeRows } from './bulk.js';

const bounds = { min: 0, max: 100 };

describe('validateGradeRows', () => {
  it('geçerli satırları ayıklar', () => {
    const r = validateGradeRows(
      [
        { studentNo: '2023001', score: 85 },
        { studentNo: '2023002', score: '90' },
      ],
      bounds,
    );
    expect(r.valid).toHaveLength(2);
    expect(r.valid[1]!.score).toBe(90);
    expect(r.errors).toHaveLength(0);
  });

  it('boş öğrenci no -> hata', () => {
    const r = validateGradeRows([{ studentNo: '  ', score: 50 }], bounds);
    expect(r.errors[0]!.reason).toBe('öğrenci no boş');
  });

  it('sayısal olmayan puan -> hata', () => {
    const r = validateGradeRows([{ studentNo: '1', score: 'abc' }], bounds);
    expect(r.errors[0]!.reason).toBe('puan sayısal değil');
  });

  it('aralık dışı puan -> hata', () => {
    const r = validateGradeRows(
      [
        { studentNo: '1', score: 120 },
        { studentNo: '2', score: -5 },
      ],
      bounds,
    );
    expect(r.errors).toHaveLength(2);
    expect(r.valid).toHaveLength(0);
  });

  it('tekrarlı öğrenci no -> ikincisi hata', () => {
    const r = validateGradeRows(
      [
        { studentNo: '1', score: 50 },
        { studentNo: '1', score: 60 },
      ],
      bounds,
    );
    expect(r.valid).toHaveLength(1);
    expect(r.errors[0]!.reason).toBe('tekrarlı öğrenci no');
  });

  it('hata index doğru', () => {
    const r = validateGradeRows(
      [
        { studentNo: '1', score: 50 },
        { studentNo: '', score: 60 },
      ],
      bounds,
    );
    expect(r.errors[0]!.index).toBe(1);
  });
});
