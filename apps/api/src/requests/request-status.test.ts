import { describe, expect, it } from 'vitest';
import {
  applyRequestTransition,
  InvalidRequestTransitionError,
  isTerminalRequest,
  REQUEST_TRANSITIONS,
  requestTransition,
} from './request-status.js';

describe('talep durum makinesi', () => {
  it('gönderildi->incelemede->onay', () => {
    expect(applyRequestTransition('submitted', 'in_review').action).toBe('incele');
    expect(applyRequestTransition('in_review', 'approved').action).toBe('onayla');
  });

  it('öğrenci iptal edebilir', () => {
    expect(applyRequestTransition('submitted', 'cancelled').action).toBe('iptal');
  });

  it('bilgi iste: incelemede->gönderildi', () => {
    expect(applyRequestTransition('in_review', 'submitted').action).toBe('bilgi_iste');
  });

  it('geçersiz geçiş hata', () => {
    expect(() => applyRequestTransition('submitted', 'approved')).toThrow(
      InvalidRequestTransitionError,
    );
    expect(() => applyRequestTransition('approved', 'in_review')).toThrow(
      InvalidRequestTransitionError,
    );
  });

  it('requestTransition tanımsızda undefined', () => {
    expect(requestTransition('approved', 'submitted')).toBeUndefined();
  });

  it('nihai durumlar', () => {
    expect(isTerminalRequest('approved')).toBe(true);
    expect(isTerminalRequest('rejected')).toBe(true);
    expect(isTerminalRequest('cancelled')).toBe(true);
    expect(isTerminalRequest('in_review')).toBe(false);
  });

  it('geçiş tablosu benzersiz', () => {
    const keys = REQUEST_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
