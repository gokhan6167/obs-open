import { describe, expect, it } from 'vitest';
import {
  reconcileBatch,
  reconcileTranscripts,
  type TranscriptSummary,
} from './reconcile.js';

const tol = { gpaTolerance: 0.01 };

function summary(over: Partial<TranscriptSummary>): TranscriptSummary {
  return {
    studentNo: '2023001',
    gpa: 3.5,
    totalCredit: 240,
    courseCount: 40,
    letters: { MAT101: 'AA', FIZ101: 'BB' },
    ...over,
  };
}

describe('reconcileTranscripts', () => {
  it('tam mutabakat -> istisna yok', () => {
    expect(reconcileTranscripts(summary({}), summary({}), tol)).toEqual([]);
  });

  it('GNO tolerans içinde -> istisna yok', () => {
    expect(reconcileTranscripts(summary({ gpa: 3.5 }), summary({ gpa: 3.505 }), tol)).toEqual([]);
  });

  it('GNO tolerans dışı -> istisna', () => {
    const ex = reconcileTranscripts(summary({ gpa: 3.5 }), summary({ gpa: 3.6 }), tol);
    expect(ex.some((e) => e.field === 'gpa')).toBe(true);
  });

  it('kredi/ders sayısı farkı -> istisna', () => {
    const ex = reconcileTranscripts(summary({}), summary({ totalCredit: 235, courseCount: 39 }), tol);
    expect(ex.map((e) => e.field)).toEqual(expect.arrayContaining(['totalCredit', 'courseCount']));
  });

  it('harf notu farkı -> istisna', () => {
    const ex = reconcileTranscripts(
      summary({}),
      summary({ letters: { MAT101: 'BA', FIZ101: 'BB' } }),
      tol,
    );
    expect(ex.some((e) => e.field === 'letter:MAT101')).toBe(true);
  });

  it('yeni sistemde eksik ders -> missing istisnası', () => {
    const ex = reconcileTranscripts(summary({}), summary({ letters: { MAT101: 'AA' } }), tol);
    expect(ex.some((e) => e.field === 'missing:FIZ101')).toBe(true);
  });

  it('OİS te olmayan fazla ders -> extra istisnası', () => {
    const ex = reconcileTranscripts(
      summary({}),
      summary({ letters: { MAT101: 'AA', FIZ101: 'BB', KIM101: 'CC' } }),
      tol,
    );
    expect(ex.some((e) => e.field === 'extra:KIM101')).toBe(true);
  });
});

describe('reconcileBatch', () => {
  it('uyuşan öğrenci istisnaya girmez, uyuşmayan girer', () => {
    const r = reconcileBatch(
      [
        { ois: summary({ studentNo: 'a' }), next: summary({ studentNo: 'a' }) },
        { ois: summary({ studentNo: 'b', gpa: 3.5 }), next: summary({ studentNo: 'b', gpa: 2.0 }) },
      ],
      tol,
    );
    expect(r.byStudent['a']).toBeUndefined();
    expect(r.byStudent['b']).toBeDefined();
    expect(r.totalExceptions).toBeGreaterThan(0);
  });

  it('hepsi uyuşursa toplam istisna 0', () => {
    const r = reconcileBatch([{ ois: summary({}), next: summary({}) }], tol);
    expect(r.totalExceptions).toBe(0);
  });
});
