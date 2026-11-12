import { describe, expect, it } from 'vitest';
import { authorize, type Actor, type AuthorizeConfig, type ResourceRef } from './authorize.js';

const config: AuthorizeConfig = {
  matrix: {
    oidb: { transcript: ['read', 'create', 'update'] }, // operasyonel: tüm öğrenciler
    ogrenci: { transcript: ['read'] }, // sadece kendi
    danisman: { transcript: ['read'] }, // sadece kendi öğrencisi
  },
  ownershipScopedRoles: ['ogrenci', 'danisman'],
};

const T = 'tenant-1';
function actor(over: Partial<Actor>): Actor {
  return { userId: 'u1', tenantId: T, roles: [], ...over };
}
function transcript(over: Partial<ResourceRef>): ResourceRef {
  return { type: 'transcript', tenantId: T, ...over };
}

describe('authorize', () => {
  it('çapraz tenant erişimini reddeder (IDOR)', () => {
    const a = actor({ roles: ['oidb'], tenantId: 'tenant-1' });
    const r = transcript({ tenantId: 'tenant-2', ownerUserId: 'x' });
    expect(authorize(a, 'read', r, config)).toBe(false);
  });

  it('izni olmayan rolü reddeder', () => {
    const a = actor({ roles: ['ogrenci'] });
    expect(authorize(a, 'update', transcript({ ownerUserId: 'u1' }), config)).toBe(false);
  });

  it('operasyonel rol (ÖİDB) sahiplik gerekmeden erişir', () => {
    const a = actor({ roles: ['oidb'] });
    expect(authorize(a, 'read', transcript({ ownerUserId: 'baskasi' }), config)).toBe(true);
    expect(authorize(a, 'update', transcript({ ownerUserId: 'baskasi' }), config)).toBe(true);
  });

  it('öğrenci sadece KENDİ transkriptini okur', () => {
    const a = actor({ userId: 'u1', roles: ['ogrenci'] });
    expect(authorize(a, 'read', transcript({ ownerUserId: 'u1' }), config)).toBe(true);
    expect(authorize(a, 'read', transcript({ ownerUserId: 'u2' }), config)).toBe(false);
  });

  it('danışman sadece kendi öğrencisine erişir', () => {
    const a = actor({ userId: 'dan1', roles: ['danisman'] });
    expect(authorize(a, 'read', transcript({ advisorUserId: 'dan1' }), config)).toBe(true);
    expect(authorize(a, 'read', transcript({ advisorUserId: 'dan2' }), config)).toBe(false);
  });

  it('birleşik roller: en geniş yetki kazanır', () => {
    const a = actor({ userId: 'u1', roles: ['ogrenci', 'oidb'] });
    // oidb sahiplik gerektirmez -> başkasının kaydına da erişir
    expect(authorize(a, 'read', transcript({ ownerUserId: 'baskasi' }), config)).toBe(true);
  });

  it('bilinmeyen kaynak tipini reddeder', () => {
    const a = actor({ roles: ['oidb'] });
    expect(authorize(a, 'read', { type: 'diploma', tenantId: T }, config)).toBe(false);
  });
});
