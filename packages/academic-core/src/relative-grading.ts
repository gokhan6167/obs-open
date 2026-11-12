/**
 * Bağıl (çan) değerlendirme — saf, %100 test kapsamlı (master prompt §M4).
 * T-skoru tabanlı: T = 50 + 10 * (ham - ortalama) / std. Harf, T-skoru bantlarına
 * göre atanır. Bantlar ve varsa ham-puan barajları PARAMETRE gelir (koda gömülü değil).
 *
 * Mutlak değerlendirme ayrı modüldedir (grade-scale.ts: bandForScore).
 */

export function mean(scores: readonly number[]): number {
  if (scores.length === 0) {
    throw new RangeError('mean: boş dizi');
  }
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

/** Popülasyon standart sapması (T-skoru için). Tek eleman/tümü eşit -> 0. */
export function populationStdDev(scores: readonly number[]): number {
  if (scores.length === 0) {
    throw new RangeError('populationStdDev: boş dizi');
  }
  const m = mean(scores);
  const variance = scores.reduce((s, x) => s + (x - m) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

/**
 * T-skoru. Std 0 ise (herkes aynı) tüm öğrenciler ortada kabul edilir -> 50.
 */
export function tScore(raw: number, meanValue: number, std: number): number {
  if (std === 0) {
    return 50;
  }
  return 50 + (10 * (raw - meanValue)) / std;
}

export interface RelativeBand {
  letter: string;
  /** Bu harfin T-skoru alt sınırı. */
  minTScore: number;
  coefficient: number;
  isPassing: boolean;
}

/** T-skorundan harfi bulur (en yüksek minTScore'u sağlayan bant). */
export function letterForTScore(bands: readonly RelativeBand[], t: number): RelativeBand {
  const sorted = [...bands].sort((a, b) => b.minTScore - a.minTScore);
  for (const band of sorted) {
    if (t >= band.minTScore) {
      return band;
    }
  }
  throw new Error(`letterForTScore: ${t} için bant yok (bantlar en düşüğü kapsamıyor)`);
}

export interface RawScore {
  studentId: string;
  raw: number;
}

export interface RelativeResult {
  studentId: string;
  raw: number;
  tScore: number;
  letter: string;
  coefficient: number;
}

export interface RelativeConfig {
  bands: readonly RelativeBand[];
  /**
   * Ham puan barajı: bu puanın altındakiler doğrudan başarısız sayılır
   * (T-skoru yüksek olsa bile çan onları geçiremez). undefined -> baraj yok.
   */
  passingRawFloor?: number;
  /** Baraj altı için verilecek harf (örn. 'FF'). passingRawFloor ile birlikte. */
  failLetter?: string;
  failCoefficient?: number;
}

/**
 * Bir şubenin ham puanlarını bağıl olarak harflendirir. Ham-puan barajı altındaki
 * öğrenciler doğrudan başarısız (çan onları taşıyamaz).
 */
export function assignRelative(
  scores: readonly RawScore[],
  config: RelativeConfig,
): RelativeResult[] {
  if (scores.length === 0) {
    return [];
  }
  const raws = scores.map((s) => s.raw);
  const m = mean(raws);
  const std = populationStdDev(raws);

  return scores.map((s) => {
    const t = tScore(s.raw, m, std);
    const belowFloor =
      config.passingRawFloor !== undefined && s.raw < config.passingRawFloor;
    if (belowFloor) {
      return {
        studentId: s.studentId,
        raw: s.raw,
        tScore: t,
        letter: config.failLetter ?? 'FF',
        coefficient: config.failCoefficient ?? 0,
      };
    }
    const band = letterForTScore(config.bands, t);
    return {
      studentId: s.studentId,
      raw: s.raw,
      tScore: t,
      letter: band.letter,
      coefficient: band.coefficient,
    };
  });
}
