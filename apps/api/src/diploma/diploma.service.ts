import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { diplomas } from '../db/schema-backoffice.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { CORE_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma yetkisi (discipline.service STAFF ile bire bir). Yazma uçları CORE_ADMIN.
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

export interface GraduateInput {
  studentId: string;
  graduationDate: string;
  degree: string;
  decisionNo?: string | undefined;
  decisionDate?: string | undefined;
}

export interface UpdateDiplomaInput {
  diplomaNo?: string | undefined;
  serialNo?: string | undefined;
  rankNo?: number | undefined;
  status?: string | undefined;
}

/**
 * Diploma (mezuniyet defteri) servisi (0015 backoffice). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir; mezun etme audit'lenir.
 */
@Injectable()
export class DiplomaService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Mezuniyet defteri; öğrenci no/e-posta join, en yeni önce. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Diploma kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: diplomas.id,
          studentId: diplomas.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          diplomaNo: diplomas.diplomaNo,
          serialNo: diplomas.serialNo,
          graduationDate: diplomas.graduationDate,
          degree: diplomas.degree,
          decisionNo: diplomas.decisionNo,
          decisionDate: diplomas.decisionDate,
          rankNo: diplomas.rankNo,
          status: diplomas.status,
          createdAt: diplomas.createdAt,
        })
        .from(diplomas)
        .innerJoin(students, eq(diplomas.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(diplomas.createdAt));
      return { items };
    });
  }

  /**
   * Öğrenciyi mezun et → diploma oluştur. Öğrenci başına tek diploma (idempotent):
   * kayıt varsa 409. diploma_no otomatik üretilir (yıl + sıra).
   */
  async graduate(input: GraduateInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, CORE_ADMIN)) {
      throw new ForbiddenException('Öğrenci mezun etme yetkiniz yok');
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

      const [existing] = await tx
        .select({ id: diplomas.id })
        .from(diplomas)
        .where(eq(diplomas.studentId, input.studentId))
        .limit(1);
      if (existing) {
        throw new ConflictException('Öğrenci için diploma kaydı zaten var');
      }

      // diploma_no otomatik: mezuniyet yılı + tenant içi sıra (yyyy-000001).
      const year = input.graduationDate.slice(0, 4);
      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(diplomas);
      const diplomaNo = `${year}-${String((counted?.count ?? 0) + 1).padStart(6, '0')}`;

      const [row] = await tx
        .insert(diplomas)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          diplomaNo,
          graduationDate: input.graduationDate,
          degree: input.degree,
          decisionNo: input.decisionNo ?? null,
          decisionDate: input.decisionDate ?? null,
          status: 'hazir',
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'diploma.graduate',
        resourceType: 'diploma',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId,
          diplomaNo,
          graduationDate: input.graduationDate,
          degree: input.degree,
        },
      });

      return row!;
    });
  }

  /** Diploma güncelle (diplomaNo/serialNo/rankNo/status). */
  async update(id: string, input: UpdateDiplomaInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, CORE_ADMIN)) {
      throw new ForbiddenException('Diploma güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const patch: Record<string, unknown> = {};
      if (input.diplomaNo !== undefined) patch.diplomaNo = input.diplomaNo;
      if (input.serialNo !== undefined) patch.serialNo = input.serialNo;
      if (input.rankNo !== undefined) patch.rankNo = input.rankNo;
      if (input.status !== undefined) patch.status = input.status;

      if (Object.keys(patch).length === 0) {
        const [row] = await tx.select().from(diplomas).where(eq(diplomas.id, id)).limit(1);
        if (!row) {
          throw new NotFoundException('Diploma bulunamadı');
        }
        return row;
      }

      const [row] = await tx
        .update(diplomas)
        .set(patch)
        .where(eq(diplomas.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Diploma bulunamadı');
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'diploma.update',
        resourceType: 'diploma',
        resourceId: row.id,
        diff: patch,
      });

      return row;
    });
  }
}
