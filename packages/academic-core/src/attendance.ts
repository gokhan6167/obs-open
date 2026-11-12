/**
 * Devamsızlık değerlendirmesi — saf (M4). Teorik/uygulama ayrı limitler; eşik
 * aşılırsa öğrenci NA (devamsızlıktan kaldı). Limitler PARAMETRE gelir.
 */
export interface AttendanceRules {
  /** Teorik derste izin verilen azami devamsızlık yüzdesi. */
  maxAbsenceTheoryPct: number;
  /** Uygulama dersinde izin verilen azami devamsızlık yüzdesi. */
  maxAbsencePracticePct: number;
}

export interface AttendanceCounts {
  theoryTotal: number;
  theoryAbsent: number;
  practiceTotal: number;
  practiceAbsent: number;
}

export interface AttendanceResult {
  theoryAbsencePct: number;
  practiceAbsencePct: number;
  theoryExceeded: boolean;
  practiceExceeded: boolean;
  /** Herhangi biri aşıldıysa NA (devamsızlıktan kaldı). */
  isNa: boolean;
}

/** Devamsızlık yüzdesi. Toplam 0 ise 0 (henüz ders yok). */
export function absencePct(absent: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return (absent / total) * 100;
}

export function evaluateAttendance(
  counts: AttendanceCounts,
  rules: AttendanceRules,
): AttendanceResult {
  const theoryAbsencePct = absencePct(counts.theoryAbsent, counts.theoryTotal);
  const practiceAbsencePct = absencePct(counts.practiceAbsent, counts.practiceTotal);
  const theoryExceeded = theoryAbsencePct > rules.maxAbsenceTheoryPct;
  const practiceExceeded = practiceAbsencePct > rules.maxAbsencePracticePct;
  return {
    theoryAbsencePct,
    practiceAbsencePct,
    theoryExceeded,
    practiceExceeded,
    isNa: theoryExceeded || practiceExceeded,
  };
}
