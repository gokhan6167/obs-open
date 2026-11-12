import { roundValue } from './rounding.js';
import type { CourseAttempt, GpaPolicy, GpaResult } from './types.js';

/**
 * GNO/YANO hesaplama — sistemdeki TEK ortalama servisi. Her yerde bu kullanılır.
 *
 * Adımlar:
 *  1) Ortalamaya girmeyen denemeleri (countsInGpa=false) ele.
 *  2) Tekrar edilen dersler için politikaya göre tek deneme seç ('last'|'highest').
 *  3) Ağırlıklı ortalama = Σ(katsayı*kredi) / Σ(kredi).
 *  4) Parametrik yuvarlama uygula.
 *
 * Değişmez (property test ile korunur): sonuç, seçilen denemelerin
 * katsayılarının min ve max'ı arasındadır. Kredi toplamı 0 ise GNO 0.
 */
export function computeGpa(attempts: readonly CourseAttempt[], policy: GpaPolicy): GpaResult {
  const counting = attempts.filter((a) => a.countsInGpa);
  const chosen = selectByRepeatPolicy(counting, policy.repeatPolicy);

  const totalCredit = chosen.reduce((sum, a) => sum + a.credit, 0);
  if (totalCredit <= 0) {
    return { gpa: 0, totalCredit: 0, raw: 0, countedAttempts: chosen };
  }

  const weighted = chosen.reduce((sum, a) => sum + a.coefficient * a.credit, 0);
  const raw = weighted / totalCredit;

  return {
    gpa: roundValue(raw, policy.rounding),
    totalCredit,
    raw,
    countedAttempts: chosen,
  };
}

/**
 * Ders bazında tekrar denemelerinden birini seçer.
 *  - 'last'    : en güncel deneme (termOrder en büyük).
 *  - 'highest' : en yüksek katsayı; eşitlikte en güncel deneme.
 */
export function selectByRepeatPolicy(
  attempts: readonly CourseAttempt[],
  policy: GpaPolicy['repeatPolicy'],
): CourseAttempt[] {
  const byCourse = new Map<string, CourseAttempt>();

  for (const attempt of attempts) {
    const current = byCourse.get(attempt.courseCode);
    if (current === undefined || isPreferred(attempt, current, policy)) {
      byCourse.set(attempt.courseCode, attempt);
    }
  }

  return [...byCourse.values()];
}

function isPreferred(
  candidate: CourseAttempt,
  current: CourseAttempt,
  policy: GpaPolicy['repeatPolicy'],
): boolean {
  if (policy === 'last') {
    return candidate.termOrder > current.termOrder;
  }
  // 'highest'
  if (candidate.coefficient !== current.coefficient) {
    return candidate.coefficient > current.coefficient;
  }
  return candidate.termOrder > current.termOrder;
}
