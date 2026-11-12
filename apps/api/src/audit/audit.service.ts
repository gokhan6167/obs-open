import { Inject, Injectable } from '@nestjs/common';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { withTenant } from '../db/tenant-context.js';

export interface AuditEntry {
  tenantId: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  diff?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only audit yazımı (master prompt §5). Tablo DB seviyesinde
 * UPDATE/DELETE'e kapalı (0001_init.sql); burası sadece ekleme yapar.
 * withTenant sayesinde RLS WITH CHECK'i sağlar (tenant_id = app.tenant_id).
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async record(entry: AuditEntry): Promise<void> {
    await withTenant(this.handle.db, entry.tenantId, async (tx) => {
      await tx.insert(auditLog).values({
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        diff: entry.diff ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      });
    });
  }
}
