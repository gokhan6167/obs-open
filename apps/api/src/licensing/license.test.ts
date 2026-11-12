import { describe, expect, it } from 'vitest';
import { signLicense, verifyLicense, type LicensePayload } from './license.js';

const secret = 'installer-secret';
const payload: LicensePayload = { tenant: 'demo', edition: 'health', expiresAt: '2027-01-01' };

describe('lisans doğrulama', () => {
  it('geçerli imza + süre -> valid', () => {
    const key = signLicense(payload, secret);
    const r = verifyLicense(key, secret, '2026-07-18');
    expect(r.valid).toBe(true);
    expect(r.payload?.edition).toBe('health');
  });

  it('yanlış secret -> imza geçersiz', () => {
    const key = signLicense(payload, secret);
    const r = verifyLicense(key, 'baska-secret', '2026-07-18');
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('imza geçersiz');
  });

  it('süresi dolmuş -> geçersiz', () => {
    const key = signLicense(payload, secret);
    const r = verifyLicense(key, secret, '2027-06-01');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/süresi doldu/);
  });

  it('biçim hatası -> geçersiz', () => {
    expect(verifyLicense('bozuk-anahtar', secret, '2026-07-18').valid).toBe(false);
  });

  it('kurcalanmış payload -> imza geçersiz', () => {
    const key = signLicense(payload, secret);
    const [, sig] = key.split('.');
    const tampered = `${Buffer.from(JSON.stringify({ ...payload, edition: 'pro' })).toString('base64url')}.${sig}`;
    expect(verifyLicense(tampered, secret, '2026-07-18').valid).toBe(false);
  });

  it('bozuk payload base64 -> imza geçersiz (imza tutmaz)', () => {
    expect(verifyLicense('!!!.abcd', secret, '2026-07-18').valid).toBe(false);
  });
});
