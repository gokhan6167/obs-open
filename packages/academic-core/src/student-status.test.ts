import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  applyTransition,
  canTransition,
  InvalidStatusTransitionError,
  isTerminalStatus,
  STUDENT_STATUS_TRANSITIONS,
  transitionAction,
  type StudentStatus,
} from './student-status.js';

describe('öğrenci durum makinesi', () => {
  it('canTransition tanımlı geçişleri kabul, tanımsızları reddeder', () => {
    expect(canTransition('aktif', 'kayit_dondurma')).toBe(true);
    expect(canTransition('aktif', 'mezun')).toBe(true);
    expect(canTransition('mezun', 'aktif')).toBe(false);
    expect(canTransition('aktif', 'af_ogrencisi')).toBe(false);
  });

  it('allowedTransitions bir durumdan çıkan geçişleri verir', () => {
    const fromAktif = allowedTransitions('aktif').map((t) => t.to);
    expect(fromAktif).toContain('kayit_dondurma');
    expect(fromAktif).toContain('mezun');
    expect(allowedTransitions('mezun')).toHaveLength(0);
  });

  it('transitionAction doğru etiketi döner', () => {
    expect(transitionAction('aktif', 'kayit_dondurma')).toBe('kayit_dondur');
    expect(transitionAction('af_ogrencisi', 'aktif')).toBe('kaydi_ac');
    expect(transitionAction('mezun', 'aktif')).toBeUndefined();
  });

  it('applyTransition geçerli geçişte hedef + action döner', () => {
    expect(applyTransition('aktif', 'pasif')).toEqual({ status: 'pasif', action: 'pasiflestir' });
  });

  it('applyTransition geçersiz geçişte InvalidStatusTransitionError fırlatır', () => {
    expect(() => applyTransition('mezun', 'aktif')).toThrow(InvalidStatusTransitionError);
    try {
      applyTransition('aktif', 'af_ogrencisi');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStatusTransitionError);
      expect((e as InvalidStatusTransitionError).from).toBe('aktif');
      expect((e as InvalidStatusTransitionError).to).toBe('af_ogrencisi');
    }
  });

  it('isTerminalStatus sadece mezun için true', () => {
    expect(isTerminalStatus('mezun')).toBe(true);
    expect(isTerminalStatus('aktif')).toBe(false);
    expect(isTerminalStatus('iliskigi_kesildi')).toBe(false);
  });

  it('nihai durumdan hiçbir çıkış geçişi yok (tutarlılık)', () => {
    const terminals: StudentStatus[] = ['mezun'];
    for (const t of terminals) {
      expect(allowedTransitions(t)).toHaveLength(0);
    }
  });

  it('af yolu: ilişik kesildi -> af -> aktif tam çalışır', () => {
    const a = applyTransition('iliskigi_kesildi', 'af_ogrencisi');
    expect(a.status).toBe('af_ogrencisi');
    const b = applyTransition(a.status, 'aktif');
    expect(b.status).toBe('aktif');
  });

  it('geçiş tablosunda çift kayıt yok (from+to benzersiz)', () => {
    const keys = STUDENT_STATUS_TRANSITIONS.map((t) => `${t.from}->${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
