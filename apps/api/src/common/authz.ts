import { ForbiddenException } from '@nestjs/common';
import type { TenantStore } from '../db/tenant-context.js';

/** Aktörde verilen rollerden en az biri var mı. */
export function hasAnyRole(ctx: TenantStore, roles: readonly string[]): boolean {
  const set = new Set(ctx.roles ?? []);
  return roles.some((r) => set.has(r));
}

/** Rol yoksa 403. Ayrıcalıklı mutasyonlar için. */
export function requireRole(ctx: TenantStore, roles: readonly string[]): void {
  if (!hasAnyRole(ctx, roles)) {
    throw new ForbiddenException('Bu işlem için yetkiniz yok');
  }
}

/**
 * Kaynak sahipliği kontrolü: ayrıcalıklı roller (staffRoles) her şeye erişir; aksi
 * halde yalnızca kaynağın sahibi (actorUserId === ownerUserId). IDOR koruması.
 */
export function requireOwnershipOrRole(
  ctx: TenantStore,
  ownerUserId: string,
  staffRoles: readonly string[],
): void {
  if (hasAnyRole(ctx, staffRoles)) {
    return;
  }
  if (ctx.actorUserId !== ownerUserId) {
    throw new ForbiddenException('Bu kaynağa erişim yetkiniz yok');
  }
}
