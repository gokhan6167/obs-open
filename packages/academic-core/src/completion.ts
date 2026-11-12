/**
 * Müfredat tamamlama kontrolü — mezuniyet motorunun (M5, Faz 4) saf çekirdeği.
 * Faz 1'de "mezuniyete ne kaldı" ve mezuniyet ön kontrolü bunu kullanır.
 *
 * Eşikler (min GNO, min AKTS) çağırana parametre gelir — koda gömülü değil.
 */
export interface RequiredCourse {
  courseCode: string;
  ects: number;
  isMandatory: boolean;
}

export interface CompletionInput {
  /** Müfredat versiyonundaki dersler. */
  required: readonly RequiredCourse[];
  /** Öğrencinin başarıyla tamamladığı ders kodları. */
  passedCourseCodes: ReadonlySet<string>;
  /** Kazanılmış toplam AKTS. */
  earnedEcts: number;
  /** Güncel GNO. */
  gpa: number;
  /** Asgari mezuniyet GNO'su (parametre). */
  minGraduationGpa: number;
  /** Asgari toplam AKTS (parametre). */
  minTotalEcts: number;
}

export interface CompletionResult {
  /** Geçilmemiş zorunlu ders kodları. */
  missingMandatory: string[];
  /** Eksik zorunlu derslerin AKTS toplamı. */
  missingMandatoryEcts: number;
  meetsGpa: boolean;
  meetsEcts: boolean;
  /** Tüm zorunlular geçilmiş + GNO + AKTS eşikleri sağlanmış. */
  isComplete: boolean;
}

export function checkCompletion(input: CompletionInput): CompletionResult {
  const missing = input.required.filter(
    (c) => c.isMandatory && !input.passedCourseCodes.has(c.courseCode),
  );
  const missingMandatory = missing.map((c) => c.courseCode);
  const missingMandatoryEcts = missing.reduce((sum, c) => sum + c.ects, 0);
  const meetsGpa = input.gpa >= input.minGraduationGpa;
  const meetsEcts = input.earnedEcts >= input.minTotalEcts;
  const isComplete = missingMandatory.length === 0 && meetsGpa && meetsEcts;

  return { missingMandatory, missingMandatoryEcts, meetsGpa, meetsEcts, isComplete };
}
