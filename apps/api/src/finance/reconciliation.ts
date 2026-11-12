/**
 * Banka mutabakat eşleştirme — saf (M6). Banka dosyasındaki kayıtları ödemelerle
 * tutara göre eşler (greedy: her banka kaydı, aynı tutarlı ilk eşleşmemiş ödemeye).
 * Eşleşmeyenler istisna raporuna (matchedPaymentId=null).
 */
export interface BankRecord {
  bankRef: string;
  amount: number;
}

export interface PaymentRecord {
  id: string;
  amount: number;
}

export interface MatchResult {
  bankRef: string;
  amount: number;
  matchedPaymentId: string | null;
}

export function matchReconciliation(
  bank: readonly BankRecord[],
  payments: readonly PaymentRecord[],
): MatchResult[] {
  const used = new Set<string>();
  return bank.map((rec) => {
    const match = payments.find((p) => p.amount === rec.amount && !used.has(p.id));
    if (match) {
      used.add(match.id);
      return { bankRef: rec.bankRef, amount: rec.amount, matchedPaymentId: match.id };
    }
    return { bankRef: rec.bankRef, amount: rec.amount, matchedPaymentId: null };
  });
}
