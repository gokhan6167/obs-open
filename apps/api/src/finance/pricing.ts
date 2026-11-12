/**
 * Ücret + indirim + taksit motoru — saf (M6). Para KURUŞ (tam sayı, minor unit)
 * olarak işlenir; float para hatası yok. Tüm oranlar/indirimler PARAMETRE gelir.
 *
 * Sıra: brüt -> burs indirimi -> sıralı indirimler (erken ödeme, kardeş...) -> taksit.
 */
export interface Discount {
  type: string;
  /** 0..1 arası oran. */
  rate: number;
}

export interface TuitionInput {
  /** Brüt ücret, kuruş (tam sayı). */
  baseAmount: number;
  /** Burs oranı 0..1 (ör. 0.5 = %50 burslu). */
  scholarshipRate: number;
  /** Sıralı uygulanan indirimler (kalan tutar üzerinden). */
  discounts: readonly Discount[];
  /** Taksit sayısı (>=1). */
  installments: number;
}

export interface Installment {
  no: number;
  amount: number;
}

export interface TuitionResult {
  gross: number;
  afterScholarship: number;
  net: number;
  installments: Installment[];
}

function assertRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} 0-1 aralığında olmalı: ${value}`);
  }
}

export function computeTuition(input: TuitionInput): TuitionResult {
  if (!Number.isInteger(input.baseAmount) || input.baseAmount < 0) {
    throw new RangeError(`baseAmount negatif olmayan tam sayı (kuruş) olmalı: ${input.baseAmount}`);
  }
  if (!Number.isInteger(input.installments) || input.installments < 1) {
    throw new RangeError(`installments >= 1 tam sayı olmalı: ${input.installments}`);
  }
  assertRate(input.scholarshipRate, 'scholarshipRate');

  const afterScholarship = Math.round(input.baseAmount * (1 - input.scholarshipRate));

  let net = afterScholarship;
  for (const d of input.discounts) {
    assertRate(d.rate, `discount(${d.type})`);
    net = Math.round(net * (1 - d.rate));
  }

  // Taksit bölme: eşit taban + artık İLK taksite. Toplam net'e tam eşit.
  const n = input.installments;
  const base = Math.floor(net / n);
  const remainder = net - base * n;
  const installments: Installment[] = Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    amount: base + (i === 0 ? remainder : 0),
  }));

  return { gross: input.baseAmount, afterScholarship, net, installments };
}
