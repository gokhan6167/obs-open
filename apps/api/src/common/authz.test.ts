import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantStore } from '../db/tenant-context.js';
import { hasAnyRole, requireOwnershipOrRole, requireRole } from './authz.js';

function ctx(over: Partial<TenantStore>): TenantStore {
  return { tenantId: 't', ...over };
}

describe('hasAnyRole', () => {
  it('rol varsa true', () => {
    expect(hasAnyRole(ctx({ roles: ['oidb'] }), ['oidb', 'mali_isler'])).toBe(true);
  });
  it('rol yoksa false', () => {
    expect(hasAnyRole(ctx({ roles: ['ogrenci'] }), ['oidb'])).toBe(false);
    expect(hasAnyRole(ctx({}), ['oidb'])).toBe(false);
  });
});

describe('requireRole', () => {
  it('yetkili geçer', () => {
    expect(() => requireRole(ctx({ roles: ['mali_isler'] }), ['mali_isler'])).not.toThrow();
  });
  it('yetkisiz 403', () => {
    expect(() => requireRole(ctx({ roles: ['ogrenci'] }), ['mali_isler'])).toThrow(
      ForbiddenException,
    );
  });
});

describe('requireOwnershipOrRole', () => {
  it('personel rolü sahiplik gerekmeden geçer', () => {
    expect(() =>
      requireOwnershipOrRole(ctx({ roles: ['oidb'], actorUserId: 'x' }), 'sahip', ['oidb']),
    ).not.toThrow();
  });
  it('sahip geçer', () => {
    expect(() =>
      requireOwnershipOrRole(ctx({ roles: ['ogrenci'], actorUserId: 'u1' }), 'u1', ['oidb']),
    ).not.toThrow();
  });
  it('başkasının kaynağı 403 (IDOR)', () => {
    expect(() =>
      requireOwnershipOrRole(ctx({ roles: ['ogrenci'], actorUserId: 'u1' }), 'u2', ['oidb']),
    ).toThrow(ForbiddenException);
  });
});
