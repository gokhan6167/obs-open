/**
 * Yürürlükteki parametre seçimi — saf, DB'siz, test edilebilir. Versiyonlu +
 * tarihli parametrelerden (harf notu ölçeği, GNO politikası, kural seti) verilen
 * tarih + program için doğru olanı seçer.
 *
 * Öncelik: program-özel kayıt (programId !== null) tenant-geneline (null) baskın;
 * eşit spesifiklikte en yeni effectiveFrom kazanır.
 */
export interface EffectiveScoped {
  programId: string | null;
  /** ISO tarih 'YYYY-MM-DD' (leksikografik karşılaştırma güvenli). */
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface EffectiveCriteria {
  programId: string;
  onDate: string; // 'YYYY-MM-DD'
}

function isApplicable(c: EffectiveScoped, crit: EffectiveCriteria): boolean {
  const scopeOk = c.programId === null || c.programId === crit.programId;
  const startedOk = c.effectiveFrom <= crit.onDate;
  const notEndedOk = c.effectiveTo === null || crit.onDate < c.effectiveTo;
  return scopeOk && startedOk && notEndedOk;
}

export function selectEffective<T extends EffectiveScoped>(
  candidates: readonly T[],
  criteria: EffectiveCriteria,
): T | undefined {
  const applicable = candidates.filter((c) => isApplicable(c, criteria));
  applicable.sort((a, b) => {
    const specificity = Number(b.programId !== null) - Number(a.programId !== null);
    if (specificity !== 0) return specificity;
    if (a.effectiveFrom > b.effectiveFrom) return -1;
    if (a.effectiveFrom < b.effectiveFrom) return 1;
    return 0;
  });
  return applicable[0];
}
