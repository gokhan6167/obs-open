import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { disciplinaryActions } from '../db/schema-discipline.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { DISCIPLINE_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma yetkisi (students.service STAFF ile bire bir).
// Yazma (ceza verme) DISCIPLINE_ADMIN ile dar tutulur.
const STAFF = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'koordinator',
  'fakulte_sekreteri',
  'mali_isler',
  'rektorluk',
  'danisman',
  'ogretim_elemani',
];
const isStaff = (roles: readonly string[] = []): boolean => roles.some((r) => STAFF.includes(r));

export interface CreateDisciplineInput {
  studentId: string;
  category: string;
  penalty: string;
  reason?: string | undefined;
  decisionNo?: string | undefined;
  decisionDate?: string | undefined;
  startsOn?: string | undefined;
  endsOn?: string | undefined;
}

/**
 * Disiplin cezası servisi (0014 backoffice). Tenant-kapsamlı (RLS), personel
 * yetkisi in-service kontrol edilir; kayıt oluşturma audit'lenir.
 */
@Injectable()
export class DisciplineService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Disiplin cezaları; opsiyonel öğrenci filtresi, öğrenci ad/no join. */
  async list(studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Disiplin kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = studentId
        ? eq(disciplinaryActions.studentId, studentId)
        : undefined;
      const items = await tx
        .select({
          id: disciplinaryActions.id,
          studentId: disciplinaryActions.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          category: disciplinaryActions.category,
          penalty: disciplinaryActions.penalty,
          reason: disciplinaryActions.reason,
          decisionNo: disciplinaryActions.decisionNo,
          decisionDate: disciplinaryActions.decisionDate,
          startsOn: disciplinaryActions.startsOn,
          endsOn: disciplinaryActions.endsOn,
          status: disciplinaryActions.status,
          createdAt: disciplinaryActions.createdAt,
        })
        .from(disciplinaryActions)
        .innerJoin(students, eq(disciplinaryActions.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(disciplinaryActions.createdAt));
      return { items };
    });
  }

  /** Disiplin cezası oluştur (yalnız disiplin yetkilisi). Öğrenci varlığı doğrulanır + audit. */
  async create(input: CreateDisciplineInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, DISCIPLINE_ADMIN)) {
      throw new ForbiddenException('Disiplin cezası oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, input.studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }

      const [row] = await tx
        .insert(disciplinaryActions)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          category: input.category,
          penalty: input.penalty,
          reason: input.reason ?? null,
          decisionNo: input.decisionNo ?? null,
          decisionDate: input.decisionDate ?? null,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          createdByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'discipline.create',
        resourceType: 'disciplinary_action',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId,
          category: input.category,
          penalty: input.penalty,
          decisionNo: input.decisionNo ?? null,
        },
      });

      return row!;
    });
  }
}
