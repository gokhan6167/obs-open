import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { roles as rolesTable, userRoles, users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { PasswordService } from './password.service.js';

export interface LoginResult {
  accessToken: string;
  userId: string;
  roles: string[];
}

/** JWT claim'i: sub (userId), tenant, roles. */
export interface JwtClaims {
  sub: string;
  tenant: string;
  roles: string[];
}

/**
 * Kimlik doğrulama (Faz-canlı). E-posta + parola (Argon2id) doğrular, kullanıcının
 * rollerini alır ve tenant + rol claim'li JWT üretir. Tenant, x-tenant-id başlığından
 * (giriş öncesi) gelir; RLS withTenant ile korunur.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const { tenantId } = requireTenant();

    const user = await withTenant(this.handle.db, tenantId, async (tx) => {
      const [u] = await tx
        .select({ id: users.id, hash: users.passwordHash, active: users.isActive })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!u || !u.active) {
        return null;
      }
      const ok = await this.passwords.verify(u.hash, password);
      if (!ok) {
        return null;
      }
      const roleRows = await tx
        .select({ key: rolesTable.key })
        .from(userRoles)
        .innerJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
        .where(eq(userRoles.userId, u.id));
      return { id: u.id, roles: roleRows.map((r) => r.key) };
    });

    if (!user) {
      throw new UnauthorizedException('E-posta veya parola hatalı');
    }

    const claims: JwtClaims = { sub: user.id, tenant: tenantId, roles: user.roles };
    const accessToken = await this.jwt.signAsync(claims);
    return { accessToken, userId: user.id, roles: user.roles };
  }

  /** Giriş yapan kullanıcının parolasını değiştirir (eski parola doğrulanır). */
  async changePassword(oldPassword: string, newPassword: string): Promise<{ ok: true }> {
    const { tenantId, actorUserId } = requireTenant();
    if (!actorUserId) {
      throw new UnauthorizedException('Oturum gerekli');
    }
    await withTenant(this.handle.db, tenantId, async (tx) => {
      const [u] = await tx
        .select({ hash: users.passwordHash })
        .from(users)
        .where(eq(users.id, actorUserId))
        .limit(1);
      if (!u || !(await this.passwords.verify(u.hash, oldPassword))) {
        throw new UnauthorizedException('Mevcut parola hatalı');
      }
      const hash = await this.passwords.hash(newPassword);
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, actorUserId));
    });
    return { ok: true };
  }
}
