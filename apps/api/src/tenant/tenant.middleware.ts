import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtClaims } from '../auth/auth.service.js';
import { runWithTenantStore, type TenantStore } from '../db/tenant-context.js';

interface MinimalRequest {
  header(name: string): string | undefined;
}

/**
 * Aktif tenant + aktör'ü çözer ve isteği AsyncLocalStorage bağlamına sarar.
 *
 * ÖNCELİK: 1) Geçerli JWT (Authorization: Bearer) -> claim'lerden tenant/actor/roles
 * (GERÇEK auth). 2) JWT yoksa ve AUTH_STUB_ENABLED açıksa (dev/test) x-tenant-id +
 * x-user-* başlıkları. Stub production'da açılamaz (env refine).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly authStub: boolean;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.authStub = config.get<boolean>('AUTH_STUB_ENABLED') ?? false;
  }

  use(req: MinimalRequest, _res: unknown, next: (error?: unknown) => void): void {
    // 1) Gerçek auth: geçerli JWT.
    const auth = req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      try {
        const claims = this.jwt.verify<JwtClaims>(auth.slice(7));
        const store: TenantStore = { tenantId: claims.tenant, roles: claims.roles };
        if (claims.sub) {
          store.actorUserId = claims.sub;
        }
        runWithTenantStore(store, () => next());
        return;
      } catch {
        // Geçersiz token -> bağlamsız devam (korunan uçlar reddeder).
      }
    }

    // 2) Tenant (giriş öncesi / public) + dev stub.
    const tenantId = req.header('x-tenant-id');
    if (!tenantId) {
      next();
      return;
    }
    const store: TenantStore = { tenantId };
    if (this.authStub) {
      const actorUserId = req.header('x-user-id');
      if (actorUserId) {
        store.actorUserId = actorUserId;
      }
      const rolesHeader = req.header('x-user-roles');
      if (rolesHeader) {
        store.roles = rolesHeader
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);
      }
    }
    runWithTenantStore(store, () => next());
  }
}
