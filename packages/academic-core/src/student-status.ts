/**
 * Öğrenci durum makinesi (M1). Durum geçişleri SADECE burada tanımlı kurallarla
 * yapılır; uygulama katmanı serbest `update` YAPMAZ (master prompt §M1).
 *
 * Her geçişin bir `action` etiketi vardır: uygulama katmanı yetki kontrolünü
 * (authorize) ve audit kaydını bununla eşler.
 *
 * NOT: İzinli geçiş kümesi makul bir VARSAYILAN'dır (docs/ASSUMPTIONS.md). İleride
 * tenant/yönetmelik bazlı özelleştirme gerekirse tablo parametrik hale getirilir;
 * makinenin yapısı (geçiş = kurallı) aynı kalır.
 */
export type StudentStatus =
  | 'aktif'
  | 'kayit_dondurma' // izinli
  | 'pasif'
  | 'iliskigi_kesildi'
  | 'mezun'
  | 'azami_sure_doldu'
  | 'af_ogrencisi';

export interface StatusTransition {
  from: StudentStatus;
  to: StudentStatus;
  /** Yetki + audit etiketi (örn. 'kayit_dondur'). */
  action: string;
}

export const STUDENT_STATUS_TRANSITIONS: readonly StatusTransition[] = [
  { from: 'aktif', to: 'kayit_dondurma', action: 'kayit_dondur' },
  { from: 'kayit_dondurma', to: 'aktif', action: 'kaydi_ac' },
  { from: 'kayit_dondurma', to: 'pasif', action: 'pasiflestir' },
  { from: 'aktif', to: 'pasif', action: 'pasiflestir' },
  { from: 'pasif', to: 'aktif', action: 'yeniden_aktiflestir' },
  { from: 'aktif', to: 'mezun', action: 'mezun_et' },
  { from: 'aktif', to: 'azami_sure_doldu', action: 'azami_sure_isaretle' },
  { from: 'pasif', to: 'azami_sure_doldu', action: 'azami_sure_isaretle' },
  { from: 'aktif', to: 'iliskigi_kesildi', action: 'iliski_kes' },
  { from: 'pasif', to: 'iliskigi_kesildi', action: 'iliski_kes' },
  { from: 'azami_sure_doldu', to: 'iliskigi_kesildi', action: 'iliski_kes' },
  { from: 'iliskigi_kesildi', to: 'af_ogrencisi', action: 'af_uygula' },
  { from: 'azami_sure_doldu', to: 'af_ogrencisi', action: 'af_uygula' },
  { from: 'af_ogrencisi', to: 'aktif', action: 'kaydi_ac' },
];

/** Nihai (çıkışsız) durumlar. */
const TERMINAL: ReadonlySet<StudentStatus> = new Set<StudentStatus>(['mezun']);

export function isTerminalStatus(status: StudentStatus): boolean {
  return TERMINAL.has(status);
}

export function allowedTransitions(from: StudentStatus): StatusTransition[] {
  return STUDENT_STATUS_TRANSITIONS.filter((t) => t.from === from);
}

export function canTransition(from: StudentStatus, to: StudentStatus): boolean {
  return STUDENT_STATUS_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** Geçişin action etiketini döner; geçiş tanımlı değilse undefined. */
export function transitionAction(from: StudentStatus, to: StudentStatus): string | undefined {
  return STUDENT_STATUS_TRANSITIONS.find((t) => t.from === from && t.to === to)?.action;
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly from: StudentStatus,
    public readonly to: StudentStatus,
  ) {
    super(`Geçersiz öğrenci durum geçişi: ${from} -> ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * Geçişi doğrular ve hedef durum + action etiketini döner. Tanımsız geçişte
 * InvalidStatusTransitionError fırlatır — böylece serbest/keyfi geçiş imkânsız.
 */
export function applyTransition(
  from: StudentStatus,
  to: StudentStatus,
): { status: StudentStatus; action: string } {
  const action = transitionAction(from, to);
  if (action === undefined) {
    throw new InvalidStatusTransitionError(from, to);
  }
  return { status: to, action };
}
