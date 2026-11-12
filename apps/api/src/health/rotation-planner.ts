/**
 * Klinik rotasyon planlama — saf (M7). Grup bazlı DÖNÜŞÜMLÜ atama: her grup her
 * periyotta farklı kliniğe döner. Round-robin: site = (grup + periyot) mod site.
 * grup sayısı <= klinik sayısı iken bir periyotta iki grup aynı kliniğe düşmez
 * (çakışmasız).
 */
export interface RotationSlot {
  groupNo: number;
  period: number;
  siteIndex: number;
}

export function planRotation(
  groupCount: number,
  siteCount: number,
  periods: number,
): RotationSlot[] {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new RangeError(`groupCount >= 1 tam sayı olmalı: ${groupCount}`);
  }
  if (!Number.isInteger(siteCount) || siteCount < 1) {
    throw new RangeError(`siteCount >= 1 tam sayı olmalı: ${siteCount}`);
  }
  if (!Number.isInteger(periods) || periods < 1) {
    throw new RangeError(`periods >= 1 tam sayı olmalı: ${periods}`);
  }

  const slots: RotationSlot[] = [];
  for (let period = 0; period < periods; period += 1) {
    for (let groupNo = 0; groupNo < groupCount; groupNo += 1) {
      slots.push({ groupNo, period, siteIndex: (groupNo + period) % siteCount });
    }
  }
  return slots;
}

/** Bir periyotta iki grup aynı kliniğe düşüyor mu (çakışma). */
export function hasCollision(slots: readonly RotationSlot[]): boolean {
  const seen = new Set<string>();
  for (const s of slots) {
    const key = `${s.period}:${s.siteIndex}`;
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}
