import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { alumni } from '../db/schema-services.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

export interface CreateAlumniInput {
  fullName: string;
  graduationYear?: number | undefined;
  programName?: string | undefined;
  email?: string | undefined;
  employment?: string | undefined;
  studentId?: string | undefined;
}

/**
 * Mezun kayıt servisi (0019). Tenant-kapsamlı (RLS). Listeleme herkese açık
 * (tenant içi), oluşturma öğrenci işleri yetkisi gerektirir + audit'lenir.
 */
@Injectable()
export class AlumniService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Mezun listesi; opsiyonel mezuniyet yılı filtresi. */
  async list(year?: number): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = year !== undefined ? eq(alumni.graduationYear, year) : undefined;
      const items = await tx
        .select({
          id: alumni.id,
          studentId: alumni.studentId,
          fullName: alumni.fullName,
          graduationYear: alumni.graduationYear,
          programName: alumni.programName,
          email: alumni.email,
          employment: alumni.employment,
          createdAt: alumni.createdAt,
        })
        .from(alumni)
        .where(where)
        .orderBy(desc(alumni.graduationYear), desc(alumni.createdAt));
      return { items };
    });
  }

  /** Mezun kaydı oluştur (öğrenci işleri yetkilisi). Öğrenci verilmişse varlığı doğrulanır + audit. */
  async create(input: CreateAlumniInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Mezun kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      if (input.studentId) {
        const [stu] = await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, input.studentId))
          .limit(1);
        if (!stu) {
          throw new NotFoundException('Öğrenci bulunamadı');
        }
      }

      const [row] = await tx
        .insert(alumni)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId ?? null,
          fullName: input.fullName,
          graduationYear: input.graduationYear ?? null,
          programName: input.programName ?? null,
          email: input.email ?? null,
          employment: input.employment ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'alumni.create',
        resourceType: 'alumni',
        resourceId: row!.id,
        diff: {
          fullName: input.fullName,
          graduationYear: input.graduationYear ?? null,
          studentId: input.studentId ?? null,
        },
      });

      return row!;
    });
  }
}
