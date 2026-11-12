import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { EXAM_ADMIN, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { courses, students } from '../db/schema-academic.js';
import { examSchedules, makeupExams } from '../db/schema-backoffice3.js';
import { sections } from '../db/schema-enrollment.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (discipline.service STAFF ile bire bir).
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

export interface CreateScheduleInput {
  sectionId: string;
  examType: string;
  examDate?: string | undefined;
  startTime?: string | undefined;
  location?: string | undefined;
  note?: string | undefined;
}

export interface CreateMakeupInput {
  studentId: string;
  sectionId: string;
  examType: string;
  decisionNo?: string | undefined;
}

/**
 * Sınav servisi (0016 backoffice3). Tenant-kapsamlı (RLS), personel yetkisi
 * in-service kontrol edilir; kayıt oluşturma audit'lenir.
 */
@Injectable()
export class ExamService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Sınav programı; opsiyonel şube filtresi, ders/şube adıyla join. */
  async listSchedules(sectionId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Sınav programına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = sectionId ? eq(examSchedules.sectionId, sectionId) : undefined;
      const items = await tx
        .select({
          id: examSchedules.id,
          sectionId: examSchedules.sectionId,
          sectionCode: sections.code,
          courseCode: courses.code,
          courseName: courses.nameTr,
          examType: examSchedules.examType,
          examDate: examSchedules.examDate,
          startTime: examSchedules.startTime,
          location: examSchedules.location,
          note: examSchedules.note,
          createdAt: examSchedules.createdAt,
        })
        .from(examSchedules)
        .innerJoin(sections, eq(examSchedules.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(where)
        .orderBy(desc(examSchedules.createdAt));
      return { items };
    });
  }

  /** Sınav programı oluştur (sınav yetkilisi). Şube varlığı doğrulanır + audit. */
  async createSchedule(input: CreateScheduleInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, EXAM_ADMIN)) {
      throw new ForbiddenException('Sınav programı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [sec] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, input.sectionId))
        .limit(1);
      if (!sec) {
        throw new NotFoundException('Şube bulunamadı');
      }

      const [row] = await tx
        .insert(examSchedules)
        .values({
          tenantId: ctx.tenantId,
          sectionId: input.sectionId,
          examType: input.examType,
          examDate: input.examDate ?? null,
          startTime: input.startTime ?? null,
          location: input.location ?? null,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'exam.schedule.create',
        resourceType: 'exam_schedule',
        resourceId: row!.id,
        diff: {
          sectionId: input.sectionId,
          examType: input.examType,
          examDate: input.examDate ?? null,
        },
      });

      return row!;
    });
  }

  /** Mazeret sınavları; öğrenci ad/no join. */
  async listMakeups(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Mazeret sınavlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: makeupExams.id,
          studentId: makeupExams.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          sectionId: makeupExams.sectionId,
          examType: makeupExams.examType,
          decisionNo: makeupExams.decisionNo,
          status: makeupExams.status,
          createdAt: makeupExams.createdAt,
        })
        .from(makeupExams)
        .innerJoin(students, eq(makeupExams.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(makeupExams.createdAt));
      return { items };
    });
  }

  /** Mazeret sınavı oluştur (sınav yetkilisi). Öğrenci varlığı doğrulanır + audit. */
  async createMakeup(input: CreateMakeupInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, EXAM_ADMIN)) {
      throw new ForbiddenException('Mazeret sınavı oluşturma yetkiniz yok');
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
        .insert(makeupExams)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          sectionId: input.sectionId,
          examType: input.examType,
          decisionNo: input.decisionNo ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'exam.makeup.create',
        resourceType: 'makeup_exam',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId,
          sectionId: input.sectionId,
          examType: input.examType,
          decisionNo: input.decisionNo ?? null,
        },
      });

      return row!;
    });
  }
}
