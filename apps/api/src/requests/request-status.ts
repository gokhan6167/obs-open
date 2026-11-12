/**
 * Talep (dilekçe) durum makinesi — saf (M8). Yapılandırılmış talep akışı:
 * gönderildi → incelemede → onay/ret; öğrenci iptal edebilir. Serbest geçiş yok.
 */
export type RequestStatus = 'submitted' | 'in_review' | 'approved' | 'rejected' | 'cancelled';

export interface RequestTransition {
  from: RequestStatus;
  to: RequestStatus;
  action: string;
}

export const REQUEST_TRANSITIONS: readonly RequestTransition[] = [
  { from: 'submitted', to: 'in_review', action: 'incele' },
  { from: 'submitted', to: 'cancelled', action: 'iptal' },
  { from: 'in_review', to: 'approved', action: 'onayla' },
  { from: 'in_review', to: 'rejected', action: 'reddet' },
  { from: 'in_review', to: 'submitted', action: 'bilgi_iste' },
];

const TERMINAL: ReadonlySet<RequestStatus> = new Set<RequestStatus>([
  'approved',
  'rejected',
  'cancelled',
]);

export function isTerminalRequest(status: RequestStatus): boolean {
  return TERMINAL.has(status);
}

export function requestTransition(
  from: RequestStatus,
  to: RequestStatus,
): RequestTransition | undefined {
  return REQUEST_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export class InvalidRequestTransitionError extends Error {
  constructor(
    public readonly from: RequestStatus,
    public readonly to: RequestStatus,
  ) {
    super(`Geçersiz talep durum geçişi: ${from} -> ${to}`);
    this.name = 'InvalidRequestTransitionError';
  }
}

export function applyRequestTransition(from: RequestStatus, to: RequestStatus): RequestTransition {
  const t = requestTransition(from, to);
  if (!t) {
    throw new InvalidRequestTransitionError(from, to);
  }
  return t;
}
