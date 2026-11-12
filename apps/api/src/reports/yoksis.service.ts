import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { requireRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { programs, students } from '../db/schema-academic.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { YOKSIS_PROVIDER, type YoksisProvider } from './yoksis.provider.js';

/**
 * YÖKSİS bildirim servisi (M9). Öğrenci kayıtlarını YÖKSİS adaptörüne aktarır.
 * Yalnızca ÖİDB/sistem yöneticisi. Gerçek protokol adaptörle takılır.
 */
@Injectable()
export class YoksisService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(YOKSIS_PROVIDER) private readonly provider: YoksisProvider,
  ) {}

  async exportEnrollments(): Promise<{ exported: number; accepted: number }> {
    const ctx = requireTenant();
    requireRole(ctx, ['oidb', 'sistem_yoneticisi']);
    const records = await withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          studentNo: students.studentNo,
          programCode: programs.code,
          status: students.status,
        })
        .from(students)
        .innerJoin(programs, eq(students.programId, programs.id)),
    );
    const result = await this.provider.reportEnrollments(records);
    return { exported: records.length, accepted: result.accepted };
  }
}
