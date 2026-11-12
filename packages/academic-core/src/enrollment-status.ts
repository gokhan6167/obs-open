/**
 * Ders kaydı durum makinesi (M3). Danışman onay akışı: taslak → gönder →
 * onay/ret → kesinleşme; çekilme (W). Serbest geçiş yok — student-status ile
 * aynı disiplin.
 *
 * `releasesSeat`: bu geçiş kontenjan koltuğunu iade eder mi (ret/çekilme).
 */
export type EnrollmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn';

export interface EnrollmentTransition {
  from: EnrollmentStatus;
  to: EnrollmentStatus;
  action: string;
  /** Geçiş kontenjan koltuğunu geri verir mi. */
  releasesSeat: boolean;
}

export const ENROLLMENT_TRANSITIONS: readonly EnrollmentTransition[] = [
  { from: 'draft', to: 'submitted', action: 'gonder', releasesSeat: false },
  { from: 'draft', to: 'withdrawn', action: 'sepetten_cikar', releasesSeat: true },
  { from: 'submitted', to: 'approved', action: 'danisman_onayla', releasesSeat: false },
  { from: 'submitted', to: 'rejected', action: 'danisman_reddet', releasesSeat: true },
  { from: 'submitted', to: 'draft', action: 'geri_gonder', releasesSeat: false },
  { from: 'approved', to: 'withdrawn', action: 'dersten_cekil', releasesSeat: true },
  { from: 'rejected', to: 'draft', action: 'yeniden_duzenle', releasesSeat: false },
];

const TERMINAL: ReadonlySet<EnrollmentStatus> = new Set<EnrollmentStatus>(['withdrawn']);

export function isTerminalEnrollment(status: EnrollmentStatus): boolean {
  return TERMINAL.has(status);
}

export function enrollmentTransition(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): EnrollmentTransition | undefined {
  return ENROLLMENT_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export class InvalidEnrollmentTransitionError extends Error {
  constructor(
    public readonly from: EnrollmentStatus,
    public readonly to: EnrollmentStatus,
  ) {
    super(`Geçersiz kayıt durum geçişi: ${from} -> ${to}`);
    this.name = 'InvalidEnrollmentTransitionError';
  }
}

/** Geçişi doğrular; hedef + action + koltuk-iade bilgisini döner. */
export function applyEnrollmentTransition(
  from: EnrollmentStatus,
  to: EnrollmentStatus,
): EnrollmentTransition {
  const t = enrollmentTransition(from, to);
  if (!t) {
    throw new InvalidEnrollmentTransitionError(from, to);
  }
  return t;
}
