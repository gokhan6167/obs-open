import { describe, expect, it } from 'vitest';
import { hasCollision, planRotation } from './rotation-planner.js';

describe('planRotation', () => {
  it('her grup için her periyotta slot üretir', () => {
    const slots = planRotation(3, 3, 3);
    expect(slots).toHaveLength(9);
  });

  it('grup<=klinik iken çakışma yok (dönüşümlü)', () => {
    expect(hasCollision(planRotation(4, 4, 4))).toBe(false);
    expect(hasCollision(planRotation(3, 5, 3))).toBe(false);
  });

  it('her grup periyotlar boyunca farklı kliniklere döner', () => {
    const slots = planRotation(2, 3, 3).filter((s) => s.groupNo === 0);
    const sites = slots.map((s) => s.siteIndex);
    expect(new Set(sites).size).toBe(3); // 3 farklı klinik
  });

  it('klinik grup sayısından azsa çakışma olabilir (rapor edilir)', () => {
    expect(hasCollision(planRotation(4, 2, 2))).toBe(true);
  });

  it('geçersiz girdiler hata', () => {
    expect(() => planRotation(0, 3, 3)).toThrow(RangeError);
    expect(() => planRotation(3, 0, 3)).toThrow(RangeError);
    expect(() => planRotation(3, 3, 0)).toThrow(RangeError);
  });
});
