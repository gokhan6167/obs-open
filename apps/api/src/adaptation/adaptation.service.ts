import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { courseAdaptations } from '../db/schema-backoffice3.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ACADEMIC_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma yetkisi (students.service STAFF ile bire bir).
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

export interface CreateAdaptationInput {
  studentId: string;
  type: 'intibak' | 'muaf' | 'transfer';
  sourceCourse: string;
  targetCurriculumCourseId?: string | undefined;
  letter?: string | undefined;
  decisionNo?: string | undefined;
}

/**
 * İntibak/muaf/transfer servisi (0016 backoffice3). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir; kayıt oluşturma audit'lenir.
 */
@Injectable()
export class AdaptationService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** İntibak kayıtları; opsiyonel öğrenci filtresi, öğrenci ad/no join. */
  async list(studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('İntibak kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = studentId
        ? eq(courseAdaptations.studentId, studentId)
        : undefined;
      const items = await tx
        .select({
          id: courseAdaptations.id,
          studentId: courseAdaptations.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          type: courseAdaptations.type,
          sourceCourse: courseAdaptations.sourceCourse,
          targetCurriculumCourseId: courseAdaptations.targetCurriculumCourseId,
          letter: courseAdaptations.letter,
          decisionNo: courseAdaptations.decisionNo,
          status: courseAdaptations.status,
          createdAt: courseAdaptations.createdAt,
        })
        .from(courseAdaptations)
        .innerJoin(students, eq(courseAdaptations.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(courseAdaptations.createdAt));
      return { items };
    });
  }

  /** İntibak/muaf/transfer kaydı oluştur (personel). Öğrenci doğrulanır + audit. */
  async create(input: CreateAdaptationInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
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
        .insert(courseAdaptations)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          type: input.type,
          sourceCourse: input.sourceCourse,
          targetCurriculumCourseId: input.targetCurriculumCourseId ?? null,
          letter: input.letter ?? null,
          decisionNo: input.decisionNo ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'adaptation.create',
        resourceType: 'course_adaptation',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId,
          type: input.type,
          sourceCourse: input.sourceCourse,
          decisionNo: input.decisionNo ?? null,
        },
      });

      return row!;
    });
  }
}
