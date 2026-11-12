/**
 * Not durum makinesi (M4). Akış: taslak → ilan → kesinleşme. İlan sonrası not
 * içeriği (harf/puan) ARTIK serbestçe değiştirilemez — yalnızca "not düzeltme"
 * akışıyla (gerekçe + karar no + onay + audit). Sessiz değişiklik imkânsız
 * (DB trigger + uygulama katmanı; bkz. 0005 migration).
 */
export type GradeStatus = 'draft' | 'announced' | 'finalized';

export interface GradeTransition {
  from: GradeStatus;
  to: GradeStatus;
  action: string;
}

export const GRADE_TRANSITIONS: readonly GradeTransition[] = [
  { from: 'draft', to: 'announced', action: 'ilan_et' },
  { from: 'announced', to: 'finalized', action: 'kesinlestir' },
];

/** İçeriği (harf/puan) serbest değiştirilemeyen durumlar — düzeltme akışı şart. */
const LOCKED_CONTENT: ReadonlySet<GradeStatus> = new Set<GradeStatus>(['announced', 'finalized']);

export function isContentLocked(status: GradeStatus): boolean {
  return LOCKED_CONTENT.has(status);
}

export function gradeTransition(from: GradeStatus, to: GradeStatus): GradeTransition | undefined {
  return GRADE_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export class InvalidGradeTransitionError extends Error {
  constructor(
    public readonly from: GradeStatus,
    public readonly to: GradeStatus,
  ) {
    super(`Geçersiz not durum geçişi: ${from} -> ${to}`);
    this.name = 'InvalidGradeTransitionError';
  }
}

export function applyGradeTransition(from: GradeStatus, to: GradeStatus): GradeTransition {
  const t = gradeTransition(from, to);
  if (!t) {
    throw new InvalidGradeTransitionError(from, to);
  }
  return t;
}
