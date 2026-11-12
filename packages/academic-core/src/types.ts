/**
 * Akademik çekirdek tipleri.
 *
 * İLKE: Hiçbir mevzuat değeri burada sabit DEĞİL. Harf notu eşikleri, katsayılar,
 * yuvarlama, tekrar politikası — hepsi çağıran tarafça (tenant + program +
 * yönetmelik-yılı) parametre olarak verilir. Bu modül sadece saf hesaplar.
 */

/** Harf notu etiketi. Parametrik; örn. 'AA' | 'BA' | ... | 'FF' | 'NA' | 'MU'. */
export type Letter = string;

/** Tek bir harf notu bandı: hangi puan aralığı, katsayısı, ortalamaya etkisi. */
export interface GradeBand {
  /** Harf etiketi (örn. 'AA'). */
  letter: Letter;
  /** Bu harfin alt puan sınırı, 0-100 (dahil). Üst sınır bir sonraki bandın altıdır. */
  minScore: number;
  /** Ağırlıklı ortalama katsayısı (örn. 4.0). */
  coefficient: number;
  /** GNO/YANO ortalamasına dahil mi? (örn. MU=muaf genelde hariç). */
  countsInGpa: boolean;
  /** Geçer not mu? */
  isPassing: boolean;
}

/** Bir harf notu ölçeği — tenant/program/yönetmelik-yılına bağlı. */
export interface GradeScale {
  /** Ölçek kimliği (ör. 'demo-2023-lisans'). */
  id: string;
  /** Puan bantları. Sıralı olması gerekmez; çözümleyici minScore'a göre değerlendirir. */
  bands: GradeBand[];
}

export type RoundingMode = 'half-up' | 'half-even';

export interface RoundingRule {
  /** Ondalık basamak sayısı (GNO için genelde 2). */
  digits: number;
  mode: RoundingMode;
}

/** Tekrar edilen ders için hangi deneme ortalamaya girer. */
export type RepeatPolicy = 'last' | 'highest';

export interface GpaPolicy {
  repeatPolicy: RepeatPolicy;
  rounding: RoundingRule;
}

/**
 * Ortalamaya girecek tek bir ders denemesi. Harf notu, ölçek üzerinden
 * katsayı + countsInGpa'ya çözümlenmiş halde verilir (bkz. resolveAttempt).
 */
export interface CourseAttempt {
  courseCode: string;
  /** AKTS ya da yerel kredi — hangisiyle GNO hesaplanacaksa çağıran verir. */
  credit: number;
  /** Bu denemedeki harf notunun katsayısı. */
  coefficient: number;
  /** Bu deneme ortalamaya dahil mi. */
  countsInGpa: boolean;
  /** Kronolojik sıra; 'last' politikası bunun en büyüğünü seçer. Küçük=eski. */
  termOrder: number;
}

export interface GpaResult {
  /** Yuvarlanmış GNO/YANO. */
  gpa: number;
  /** Ortalamaya giren toplam kredi. */
  totalCredit: number;
  /** Yuvarlama öncesi ham değer (denetim/altın test için). */
  raw: number;
  /** Politika sonrası ortalamaya giren seçilmiş denemeler. */
  countedAttempts: CourseAttempt[];
}
