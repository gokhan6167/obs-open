/**
 * Onur / yüksek onur belirleme — saf (M5). Eşikler PARAMETRE gelir (koda gömülü
 * değil). Uygunluk (eligible) çağıran tarafça belirlenir: örn. disiplin cezası
 * yok, hiç FF yok, normal sürede — kurumun kuralına göre.
 */
export interface HonorThresholds {
  /** Yüksek onur asgari GNO'su (ör. 3.50). */
  highHonor: number;
  /** Onur asgari GNO'su (ör. 3.00). */
  honor: number;
}

export type HonorStanding = 'yuksek_onur' | 'onur' | 'yok';

export function honorStanding(
  gpa: number,
  thresholds: HonorThresholds,
  eligible = true,
): HonorStanding {
  if (!eligible) {
    return 'yok';
  }
  if (gpa >= thresholds.highHonor) {
    return 'yuksek_onur';
  }
  if (gpa >= thresholds.honor) {
    return 'onur';
  }
  return 'yok';
}
