import { evaluateCondition, type ConditionNode, type StudentContext } from './prerequisite.js';

/**
 * Ders kayıt kuralları motoru (M3) — saf, test edilebilir. AKTS limitleri,
 * ders çakışması, ön koşul. Eşikler parametre gelir (koda gömülü değil).
 * Kontenjan atomikliği DB seviyesindedir (bu modülde değil).
 */

export interface EctsRules {
  minEctsPerTerm: number;
  maxEctsPerTerm: number;
  /** GNO bu eşiğin üstündeyse üst limit maxEctsWithBoost'a çıkar. */
  gpaBoostThreshold?: number;
  maxEctsWithBoost?: number;
}

/** GNO'ya göre yürürlükteki üst AKTS limiti. */
export function maxEctsForGpa(rules: EctsRules, gpa: number): number {
  if (
    rules.gpaBoostThreshold !== undefined &&
    rules.maxEctsWithBoost !== undefined &&
    gpa >= rules.gpaBoostThreshold
  ) {
    return rules.maxEctsWithBoost;
  }
  return rules.maxEctsPerTerm;
}

/** Haftalık ders zaman dilimi. Gün 1-7; dakika gün içi (0-1440). */
export interface TimeSlot {
  day: number;
  startMin: number;
  endMin: number;
}

export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;
}

/** Kayıt adayı ders (şube). */
export interface RegistrationCandidate {
  courseCode: string;
  ects: number;
  slots: readonly TimeSlot[];
  prerequisite?: ConditionNode;
}

export type ViolationType = 'ects_over' | 'ects_under' | 'conflict' | 'prerequisite';

export interface RegistrationViolation {
  type: ViolationType;
  detail: string;
}

export interface RegistrationResult {
  ok: boolean;
  violations: RegistrationViolation[];
  totalEcts: number;
  maxEcts: number;
}

export interface RegistrationInput {
  candidates: readonly RegistrationCandidate[];
  rules: EctsRules;
  gpa: number;
  student: StudentContext;
  /** AKTS alt sınırı kontrol edilsin mi (ör. son gönderimde evet, taslakta hayır). */
  enforceMin?: boolean;
}

/**
 * Kayıt sepetini kurallara göre doğrular. Çakışma, AKTS üst/alt limiti ve her
 * adayın ön koşulu kontrol edilir. Tüm ihlaller toplanır (ilkinde durmaz).
 */
export function validateRegistration(input: RegistrationInput): RegistrationResult {
  const violations: RegistrationViolation[] = [];
  const totalEcts = input.candidates.reduce((sum, c) => sum + c.ects, 0);
  const maxEcts = maxEctsForGpa(input.rules, input.gpa);

  if (totalEcts > maxEcts) {
    violations.push({
      type: 'ects_over',
      detail: `Toplam AKTS ${totalEcts}, üst limit ${maxEcts}`,
    });
  }
  if (input.enforceMin === true && totalEcts < input.rules.minEctsPerTerm) {
    violations.push({
      type: 'ects_under',
      detail: `Toplam AKTS ${totalEcts}, alt limit ${input.rules.minEctsPerTerm}`,
    });
  }

  // Çakışma: tüm adayların tüm slotlarını ikili karşılaştır.
  const flat = input.candidates.flatMap((c) => c.slots.map((s) => ({ code: c.courseCode, slot: s })));
  for (let i = 0; i < flat.length; i += 1) {
    for (let j = i + 1; j < flat.length; j += 1) {
      const a = flat[i]!;
      const b = flat[j]!;
      if (a.code !== b.code && slotsOverlap(a.slot, b.slot)) {
        violations.push({ type: 'conflict', detail: `${a.code} ile ${b.code} çakışıyor` });
      }
    }
  }

  // Ön koşul.
  for (const c of input.candidates) {
    if (c.prerequisite && !evaluateCondition(c.prerequisite, input.student)) {
      violations.push({ type: 'prerequisite', detail: `${c.courseCode} ön koşulu sağlanmıyor` });
    }
  }

  return { ok: violations.length === 0, violations, totalEcts, maxEcts };
}
