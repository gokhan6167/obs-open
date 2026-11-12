import { describe, expect, it } from 'vitest';
import { roundValue } from './rounding.js';

describe('roundValue', () => {
  it('half-up: 0.5 yukarı yuvarlar', () => {
    expect(roundValue(2.675, { digits: 2, mode: 'half-up' })).toBe(2.68);
    expect(roundValue(2.674, { digits: 2, mode: 'half-up' })).toBe(2.67);
    expect(roundValue(3.145, { digits: 2, mode: 'half-up' })).toBe(3.15);
  });

  it('half-up: kayan nokta hatasına dayanıklı', () => {
    // 1.005 * 100 = 100.4999... — epsilon dürtmesi olmadan 1.00 çıkardı.
    expect(roundValue(1.005, { digits: 2, mode: 'half-up' })).toBe(1.01);
  });

  it('half-up: sıfır ve negatif', () => {
    expect(roundValue(0, { digits: 2, mode: 'half-up' })).toBe(0);
    expect(roundValue(-2.5, { digits: 0, mode: 'half-up' })).toBe(-3);
  });

  it('half-even: tam ortada çift olana yuvarlar', () => {
    expect(roundValue(2.5, { digits: 0, mode: 'half-even' })).toBe(2);
    expect(roundValue(3.5, { digits: 0, mode: 'half-even' })).toBe(4);
    expect(roundValue(2.665, { digits: 2, mode: 'half-even' })).toBe(2.66);
  });

  it('half-even: orta olmayan değerde normal yuvarlar', () => {
    expect(roundValue(2.671, { digits: 2, mode: 'half-even' })).toBe(2.67);
    expect(roundValue(2.678, { digits: 2, mode: 'half-even' })).toBe(2.68);
  });

  it('digits=0 tam sayıya yuvarlar', () => {
    expect(roundValue(3.6, { digits: 0, mode: 'half-up' })).toBe(4);
  });

  it('geçersiz girdilerde hata fırlatır', () => {
    expect(() => roundValue(Number.NaN, { digits: 2, mode: 'half-up' })).toThrow(RangeError);
    expect(() => roundValue(Infinity, { digits: 2, mode: 'half-up' })).toThrow(RangeError);
    expect(() => roundValue(1.23, { digits: -1, mode: 'half-up' })).toThrow(RangeError);
    expect(() => roundValue(1.23, { digits: 1.5, mode: 'half-up' })).toThrow(RangeError);
  });
});
