/**
 * Çift anadal (ÇAP) / yandal başvuru uygunluğu — saf (M1). Kurallar parametre
 * gelir (koda gömülü değil). Uygun değilse gerekçeler döner.
 *
 * Tipik kural: ÇAP min GNO ~3.00, yandal ~2.50; başvuru belirli yarıyıl
 * aralığında; disiplin cezası olmamalı — hepsi tenant/program parametresi.
 */
export type DoubleMajorType = 'cap' | 'yandal';

export interface DoubleMajorRules {
  /** ÇAP için asgari GNO. */
  minGpaCap: number;
  /** Yandal için asgari GNO. */
  minGpaYandal: number;
  /** Başvuru için tamamlanmış yarıyıl oranı alt sınırı (0-1). */
  minCompletedRatio: number;
  /** Üst sınır (0-1). */
  maxCompletedRatio: number;
}

export interface DoubleMajorEligibilityInput {
  type: DoubleMajorType;
  gpa: number;
  completedTerms: number;
  totalTerms: number;
  hasDisciplinaryPenalty: boolean;
  rules: DoubleMajorRules;
}

export interface DoubleMajorEligibility {
  eligible: boolean;
  minGpa: number;
  reasons: string[];
}

export function checkDoubleMajorEligibility(
  input: DoubleMajorEligibilityInput,
): DoubleMajorEligibility {
  if (input.totalTerms <= 0) {
    throw new RangeError('totalTerms > 0 olmalı');
  }
  const minGpa = input.type === 'cap' ? input.rules.minGpaCap : input.rules.minGpaYandal;
  const ratio = input.completedTerms / input.totalTerms;
  const reasons: string[] = [];

  if (input.gpa < minGpa) {
    reasons.push(`GNO yetersiz (gerekli ${minGpa}, mevcut ${input.gpa})`);
  }
  if (ratio < input.rules.minCompletedRatio) {
    reasons.push('Başvuru için henüz erken (yeterli yarıyıl tamamlanmadı)');
  }
  if (ratio > input.rules.maxCompletedRatio) {
    reasons.push('Başvuru için çok geç (üst yarıyıl aşıldı)');
  }
  if (input.hasDisciplinaryPenalty) {
    reasons.push('Disiplin cezası nedeniyle uygun değil');
  }

  return { eligible: reasons.length === 0, minGpa, reasons };
}
