/**
 * Kurul (komite) not motoru — saf (M7). Tıp/diş eğitim modeli: klasik yarıyıl
 * yerine dönem = kurullar toplamı. Yıl notu = kurul ağırlıklı ortalaması (belli
 * ağırlıkla) + dönem sonu genel sınav (kalan ağırlık); geçme barajı parametrik.
 *
 * Bu, yarıyıl GNO'dan (gpa.ts) AYRI bir "eğitim modeli"dir ama aynı akademik
 * çekirdeği (harf/ölçek/parametre) kullanır — çift model, tek çekirdek.
 */
export interface CommitteeScore {
  committeeId: string;
  /** Bu kurulun kurullar-içi ağırlığı (kurullar toplamı 1'e yakın olmalı). */
  weight: number;
  /** Kurul sonu sınav puanı (0-100). */
  score: number;
}

export interface CommitteeYearInput {
  committees: readonly CommitteeScore[];
  /** Dönem sonu genel sınav puanı (0-100). */
  generalExamScore: number;
  /** Kurullar toplamının yıl notundaki ağırlığı (0..1). */
  committeesWeightInYear: number;
  /** Genel sınavın yıl notundaki ağırlığı (0..1). committees + general = 1. */
  generalExamWeightInYear: number;
  /** Geçme barajı (ör. 60). */
  passingThreshold: number;
}

export interface CommitteeYearResult {
  committeesAverage: number;
  yearScore: number;
  passed: boolean;
}

function assertWeight(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} 0-1 aralığında olmalı: ${value}`);
  }
}

const WEIGHT_EPSILON = 1e-6;

export function computeCommitteeYear(input: CommitteeYearInput): CommitteeYearResult {
  if (input.committees.length === 0) {
    throw new RangeError('computeCommitteeYear: en az bir kurul gerekir');
  }
  assertWeight(input.committeesWeightInYear, 'committeesWeightInYear');
  assertWeight(input.generalExamWeightInYear, 'generalExamWeightInYear');
  if (Math.abs(input.committeesWeightInYear + input.generalExamWeightInYear - 1) > WEIGHT_EPSILON) {
    throw new RangeError('Yıl ağırlıkları toplamı 1 olmalı (kurullar + genel sınav)');
  }

  let weightSum = 0;
  let weighted = 0;
  for (const c of input.committees) {
    assertWeight(c.weight, `committee(${c.committeeId}).weight`);
    weightSum += c.weight;
    weighted += c.score * c.weight;
  }
  if (Math.abs(weightSum - 1) > WEIGHT_EPSILON) {
    throw new RangeError(`Kurul ağırlıkları toplamı 1 olmalı: ${weightSum}`);
  }

  const committeesAverage = weighted;
  const yearScore =
    committeesAverage * input.committeesWeightInYear +
    input.generalExamScore * input.generalExamWeightInYear;

  return {
    committeesAverage,
    yearScore,
    passed: yearScore >= input.passingThreshold,
  };
}
