import { Injectable } from '@nestjs/common';

/**
 * vPOS/ödeme sağlayıcı arayüzü (M6). Gerçek protokol (iyzico / banka vPOS) sonradan
 * adaptörle takılır (master prompt §4 deseni: arayüz + mock + sonradan tak).
 */
export interface ChargeParams {
  amount: number; // kuruş
  idempotencyKey: string;
  cardToken?: string;
}

export interface ChargeResult {
  success: boolean;
  providerRef: string;
}

export interface PaymentProvider {
  charge(params: ChargeParams): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Geliştirme mock'u — daima başarılı, deterministik ref. Gerçek vPOS'ta değişir. */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  charge(params: ChargeParams): Promise<ChargeResult> {
    return Promise.resolve({ success: true, providerRef: `mock-${params.idempotencyKey}` });
  }
}
