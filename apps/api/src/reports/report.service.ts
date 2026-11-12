import { Inject, Injectable } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';
import { requireRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { programs, students } from '../db/schema-academic.js';
import { enrollments } from '../db/schema-enrollment.js';
import { invoices } from '../db/schema-finance.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

const REPORT_ROLES = [
  'oidb',
  'rektorluk',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'mali_isler',
];

/**
 * Rapor motoru (M9). HAZIR raporlar + aggregation; AD-HOC SQL YOK (§M9).
 * Yalnızca yönetim/ÖİDB rolleri. Tüm sorgular tenant'a kısıtlı (RLS + withTenant).
 */
@Injectable()
export class ReportService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async dashboard(): Promise<{
    studentCount: number;
    activeStudents: number;
    graduatedStudents: number;
    totalEnrollments: number;
    collectedAmount: number;
  }> {
    const ctx = requireTenant();
    requireRole(ctx, REPORT_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [studentAgg] = await tx
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${students.status} = 'aktif')::int`,
          graduated: sql<number>`count(*) filter (where ${students.status} = 'mezun')::int`,
        })
        .from(students);
      const [enrollAgg] = await tx.select({ total: count() }).from(enrollments);
      const [payAgg] = await tx
        .select({ collected: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::bigint` })
        .from(invoices);

      return {
        studentCount: studentAgg?.total ?? 0,
        activeStudents: Number(studentAgg?.active ?? 0),
        graduatedStudents: Number(studentAgg?.graduated ?? 0),
        totalEnrollments: enrollAgg?.total ?? 0,
        collectedAmount: Number(payAgg?.collected ?? 0),
      };
    });
  }

  async studentsByProgram(): Promise<{ program: string; count: number }[]> {
    const ctx = requireTenant();
    requireRole(ctx, REPORT_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({ program: programs.name, count: count() })
        .from(students)
        .innerJoin(programs, eq(students.programId, programs.id))
        .groupBy(programs.name),
    );
  }
}
