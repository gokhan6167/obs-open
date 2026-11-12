import type { CourseAttempt, GradeBand, GradeScale, Letter } from './types.js';

/**
 * Harf notu ölçeği yardımcıları. Puan -> harf ve harf -> band çözümlemesi.
 * Ölçek tamamen parametrik gelir; burada gömülü eşik yoktur.
 */

/** Bantları alt sınıra göre azalan sıralar (kopya döner). */
function sortedBandsDesc(scale: GradeScale): GradeBand[] {
  return [...scale.bands].sort((a, b) => b.minScore - a.minScore);
}

/**
 * 0-100 arası ham puandan harf bandını bulur.
 * En yüksek minScore'u sağlayan bandı döner.
 */
export function bandForScore(scale: GradeScale, score: number): GradeBand {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError(`bandForScore: puan 0-100 dışında: ${score}`);
  }
  for (const band of sortedBandsDesc(scale)) {
    if (score >= band.minScore) {
      return band;
    }
  }
  throw new Error(`bandForScore: ${score} için band yok (ölçek 0'ı kapsamıyor: ${scale.id})`);
}

/** Verilen harf etiketinin bandını döner. */
export function bandForLetter(scale: GradeScale, letter: Letter): GradeBand {
  const band = scale.bands.find((b) => b.letter === letter);
  if (!band) {
    throw new Error(`bandForLetter: '${letter}' ölçekte yok (${scale.id})`);
  }
  return band;
}

/**
 * Bir dersin harf notunu, ölçek üzerinden GNO'ya girecek CourseAttempt'e çözer.
 * GNO hesabı sadece sayısal katsayılarla çalışsın diye ayrımı burada yaparız.
 */
export function resolveAttempt(
  scale: GradeScale,
  input: { courseCode: string; credit: number; letter: Letter; termOrder: number },
): CourseAttempt {
  const band = bandForLetter(scale, input.letter);
  return {
    courseCode: input.courseCode,
    credit: input.credit,
    coefficient: band.coefficient,
    countsInGpa: band.countsInGpa,
    termOrder: input.termOrder,
  };
}
