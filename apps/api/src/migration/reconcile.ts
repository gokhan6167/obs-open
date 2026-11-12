/**
 * Göç mutabakatı — saf (M11). Göç sonrası her öğrenci için OİS transkripti ile
 * yeni sistem transkripti otomatik karşılaştırılır. Uyuşmayan her alan istisna
 * raporuna düşer. İSTİSNA RAPORU SIFIRLANMADAN CANLIYA GEÇİLMEZ (master prompt §M11).
 */
export interface TranscriptSummary {
  studentNo: string;
  gpa: number;
  totalCredit: number;
  courseCount: number;
  /** Ders kodu -> harf notu. */
  letters: Record<string, string>;
}

export interface ReconciliationTolerance {
  /** GNO için kabul edilen sapma (ör. 0.01 yuvarlama farkı). */
  gpaTolerance: number;
}

export interface ReconciliationException {
  studentNo: string;
  /** 'gpa' | 'totalCredit' | 'courseCount' | 'letter:<ders>' | 'missing:<ders>' */
  field: string;
  oisValue: string;
  newValue: string;
}

/**
 * İki transkripti karşılaştırır; uyuşmayan alanların istisna listesini döner.
 * Boş liste = tam mutabakat. GNO tolerans dahilinde; diğerleri tam eşleşme.
 */
export function reconcileTranscripts(
  ois: TranscriptSummary,
  next: TranscriptSummary,
  tolerance: ReconciliationTolerance,
): ReconciliationException[] {
  const exceptions: ReconciliationException[] = [];
  const studentNo = ois.studentNo;

  if (Math.abs(ois.gpa - next.gpa) > tolerance.gpaTolerance) {
    exceptions.push({ studentNo, field: 'gpa', oisValue: String(ois.gpa), newValue: String(next.gpa) });
  }
  if (ois.totalCredit !== next.totalCredit) {
    exceptions.push({
      studentNo,
      field: 'totalCredit',
      oisValue: String(ois.totalCredit),
      newValue: String(next.totalCredit),
    });
  }
  if (ois.courseCount !== next.courseCount) {
    exceptions.push({
      studentNo,
      field: 'courseCount',
      oisValue: String(ois.courseCount),
      newValue: String(next.courseCount),
    });
  }

  // Harf notları: OİS'teki her ders yeni sistemde aynı harfte mi.
  for (const [course, oisLetter] of Object.entries(ois.letters)) {
    const nextLetter = next.letters[course];
    if (nextLetter === undefined) {
      exceptions.push({ studentNo, field: `missing:${course}`, oisValue: oisLetter, newValue: '-' });
    } else if (nextLetter !== oisLetter) {
      exceptions.push({
        studentNo,
        field: `letter:${course}`,
        oisValue: oisLetter,
        newValue: nextLetter,
      });
    }
  }
  // Yeni sistemde olup OİS'te olmayan dersler.
  for (const course of Object.keys(next.letters)) {
    if (ois.letters[course] === undefined) {
      exceptions.push({
        studentNo,
        field: `extra:${course}`,
        oisValue: '-',
        newValue: next.letters[course]!,
      });
    }
  }

  return exceptions;
}

/** Toplu mutabakat: her öğrenci çifti için istisnaları toplar. */
export function reconcileBatch(
  pairs: readonly { ois: TranscriptSummary; next: TranscriptSummary }[],
  tolerance: ReconciliationTolerance,
): { totalExceptions: number; byStudent: Record<string, ReconciliationException[]> } {
  const byStudent: Record<string, ReconciliationException[]> = {};
  let totalExceptions = 0;
  for (const { ois, next } of pairs) {
    const exceptions = reconcileTranscripts(ois, next, tolerance);
    if (exceptions.length > 0) {
      byStudent[ois.studentNo] = exceptions;
      totalExceptions += exceptions.length;
    }
  }
  return { totalExceptions, byStudent };
}
