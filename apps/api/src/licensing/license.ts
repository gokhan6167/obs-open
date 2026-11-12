import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Lisans anahtarı doğrulama (Faz 9 / on-prem). Anahtar = base64url(payload).hex(hmac).
 * On-prem kurulumda lisans + son kullanma + sürüm paketi (edition) doğrulanır.
 * Saf ve test edilebilir; `now` parametre gelir (Date.now yok).
 */
export interface LicensePayload {
  tenant: string;
  edition: 'core' | 'pro' | 'health';
  /** ISO tarih 'YYYY-MM-DD'. */
  expiresAt: string;
}

export interface LicenseVerifyResult {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
}

function hmacHex(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function signLicense(payload: LicensePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmacHex(body, secret)}`;
}

export function verifyLicense(key: string, secret: string, now: string): LicenseVerifyResult {
  const parts = key.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'biçim hatası' };
  }
  const [body, sig] = parts as [string, string];

  const expected = hmacHex(body, secret);
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'imza geçersiz' };
  }

  let payload: LicensePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LicensePayload;
  } catch {
    return { valid: false, reason: 'payload çözülemedi' };
  }

  if (payload.expiresAt < now) {
    return { valid: false, reason: `süresi doldu (${payload.expiresAt})`, payload };
  }
  return { valid: true, payload };
}
