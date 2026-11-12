import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { ACADEMIC_ADMIN, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { sectionInstructors, sectionMeetings } from '../db/schema-depth.js';
import { sections } from '../db/schema-enrollment.js';
import { classrooms } from '../db/schema-backoffice.js';
import { users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (facilities/diploma STAFF ile bire bir).
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

export interface CreateMeetingInput {
  dayOfWeek?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  kind: string;
  classroomId?: string | undefined;
  instructorUserId?: string | undefined;
  isMakeup?: boolean | undefined;
  ykkNo?: string | undefined;
  weekNo?: number | undefined;
  note?: string | undefined;
}

export interface CreateInstructorInput {
  userId: string;
  role: string;
}

/**
 * Ders açma (section) detay servisi (0017): haftalık program (sectionMeetings)
 * ve öğretim elemanı atamaları (sectionInstructors). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir.
 */
@Injectable()
export class SectionDetailService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Section detayı: haftalık program (derslik adıyla) + hoca atamaları (email ile). */
  async get(sectionId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Ders detayına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [section] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!section) {
        throw new NotFoundException('Ders açma (section) bulunamadı');
      }

      const meetings = await tx
        .select({
          id: sectionMeetings.id,
          sectionId: sectionMeetings.sectionId,
          dayOfWeek: sectionMeetings.dayOfWeek,
          startTime: sectionMeetings.startTime,
          endTime: sectionMeetings.endTime,
          kind: sectionMeetings.kind,
          classroomId: sectionMeetings.classroomId,
          classroomCode: classrooms.code,
          classroomName: classrooms.name,
          instructorUserId: sectionMeetings.instructorUserId,
          isMakeup: sectionMeetings.isMakeup,
          ykkNo: sectionMeetings.ykkNo,
          weekNo: sectionMeetings.weekNo,
          note: sectionMeetings.note,
          createdAt: sectionMeetings.createdAt,
        })
        .from(sectionMeetings)
        .leftJoin(classrooms, eq(sectionMeetings.classroomId, classrooms.id))
        .where(eq(sectionMeetings.sectionId, sectionId))
        .orderBy(asc(sectionMeetings.dayOfWeek), asc(sectionMeetings.startTime));

      const instructors = await tx
        .select({
          id: sectionInstructors.id,
          sectionId: sectionInstructors.sectionId,
          userId: sectionInstructors.userId,
          email: users.email,
          role: sectionInstructors.role,
          createdAt: sectionInstructors.createdAt,
        })
        .from(sectionInstructors)
        .innerJoin(users, eq(sectionInstructors.userId, users.id))
        .where(eq(sectionInstructors.sectionId, sectionId))
        .orderBy(asc(sectionInstructors.createdAt));

      return { meetings, instructors };
    });
  }

  /** Haftalık program satırı ekle (akademik yetkili). Section varlığı doğrulanır. */
  async createMeeting(sectionId: string, input: CreateMeetingInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Program satırı ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [section] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!section) {
        throw new NotFoundException('Ders açma (section) bulunamadı');
      }

      const [row] = await tx
        .insert(sectionMeetings)
        .values({
          tenantId: ctx.tenantId,
          sectionId,
          dayOfWeek: input.dayOfWeek ?? null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          kind: input.kind,
          classroomId: input.classroomId ?? null,
          instructorUserId: input.instructorUserId ?? null,
          isMakeup: input.isMakeup ?? false,
          ykkNo: input.ykkNo ?? null,
          weekNo: input.weekNo ?? null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Öğretim elemanı ata (akademik yetkili). Section varlığı doğrulanır. */
  async createInstructor(sectionId: string, input: CreateInstructorInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Öğretim elemanı atama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [section] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!section) {
        throw new NotFoundException('Ders açma (section) bulunamadı');
      }

      const [row] = await tx
        .insert(sectionInstructors)
        .values({
          tenantId: ctx.tenantId,
          sectionId,
          userId: input.userId,
          role: input.role,
        })
        .returning();
      return row!;
    });
  }

  /** Haftalık program satırını sil (akademik yetkili). */
  async deleteMeeting(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Program satırı silme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .delete(sectionMeetings)
        .where(and(eq(sectionMeetings.id, id), eq(sectionMeetings.tenantId, ctx.tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException('Program satırı bulunamadı');
      }
      return { deleted: true, id: row.id };
    });
  }
}
