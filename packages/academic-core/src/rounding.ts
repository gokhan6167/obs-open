import type { RoundingRule } from './types.js';

/**
 * Parametrik yuvarlama. GNO gibi resmi hesaplarda yuvarlama kuralı mevzuata
 * göre değişebildiği için ayrı, saf ve testli tutulur.
 *
 * Kayan nokta hatasını telafi etmek için küçük bir epsilon dürtmesi kullanılır
 * (ör. 2.675 * 100 = 267.4999999... sorununu düzeltir).
 */
const FP_EPSILON = 1e-9;

export function roundValue(value: number, rule: RoundingRule): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundValue: sonlu olmayan değer: ${value}`);
  }
  if (!Number.isInteger(rule.digits) || rule.digits < 0) {
    throw new RangeError(`roundValue: geçersiz digits: ${rule.digits}`);
  }

  const factor = 10 ** rule.digits;
  const scaled = value * factor;

  let rounded: number;
  if (rule.mode === 'half-even') {
    const floor = Math.floor(scaled);
    const diff = scaled - floor;
    if (Math.abs(diff - 0.5) < FP_EPSILON) {
      // tam ortada: çift olana yuvarla (bankacı yuvarlaması)
      rounded = floor % 2 === 0 ? floor : floor + 1;
    } else {
      rounded = Math.round(scaled);
    }
  } else {
    // half-up: 0.5 yukarı. Negatif değerler GNO'da beklenmez ama tutarlı davranır.
    const sign = Math.sign(scaled) || 1;
    rounded = sign * Math.round(Math.abs(scaled) + FP_EPSILON);
  }

  return rounded / factor;
}
