import { describe, expect, it } from 'vitest';
import { honorStanding, type HonorThresholds } from './honor.js';

const thresholds: HonorThresholds = { highHonor: 3.5, honor: 3.0 };

describe('honorStanding', () => {
  it('yüksek onur eşiğinde/üstünde', () => {
    expect(honorStanding(3.5, thresholds)).toBe('yuksek_onur');
    expect(honorStanding(3.9, thresholds)).toBe('yuksek_onur');
  });
  it('onur aralığı', () => {
    expect(honorStanding(3.0, thresholds)).toBe('onur');
    expect(honorStanding(3.49, thresholds)).toBe('onur');
  });
  it('eşik altı yok', () => {
    expect(honorStanding(2.99, thresholds)).toBe('yok');
  });
  it('uygun değilse (disiplin/FF) yok', () => {
    expect(honorStanding(3.9, thresholds, false)).toBe('yok');
  });
});
