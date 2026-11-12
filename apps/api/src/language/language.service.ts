import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { applicants } from '../db/schema-backoffice.js';
import { languageProficiencies } from '../db/schema-admissions-deep.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ADMISSIONS_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/yazma yetkisi (admissions.service STAFF ile bire bir).
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

/** Muafiyet eşiği: 65 ve üstü muaf, 50-64 beklemede, altı hazırlık. */
const MUAF_MIN = 65;
const BEKLEMEDE_MIN = 50;

/** Sınav puanından yeterlilik sonucu; puan yoksa "beklemede". */
const resultForScore = (score?: number): string => {
  if (score === undefined) return 'beklemede';
  if (score >= MUAF_MIN) return 'muaf';
  if (score >= BEKLEMEDE_MIN) return 'beklemede';
  return 'hazirlik';
};

export interface CreateProficiencyInput {
  studentId?: string | undefined;
  applicantId?: string | undefined;
  examType: string;
  score?: number | undefined;
  examDate?: string | undefined;
  note?: string | undefined;
}

export interface UpdateProficiencyInput {
  result: string;
  note?: string | undefined;
}

/**
 * Dil yeterlilik/hazırlık servisi (0021 admissions-deep). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir; yazma işlemleri audit'lenir.
 */
@Injectable()
export class LanguageService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Dil yeterlilik kayıtları; öğrenci/aday adı join, opsiyonel studentId/applicantId filtresi. */
  async listProficiencies(
    studentId?: string,
    applicantId?: string,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Dil yeterlilik kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const filters: SQL[] = [];
      if (studentId) filters.push(eq(languageProficiencies.studentId, studentId));
      if (applicantId) filters.push(eq(languageProficiencies.applicantId, applicantId));
      const items = await tx
        .select({
          id: languageProficiencies.id,
          studentId: languageProficiencies.studentId,
          studentNo: students.studentNo,
          studentName: users.email,
          applicantId: languageProficiencies.applicantId,
          applicantName: applicants.fullName,
          examType: languageProficiencies.examType,
          score: languageProficiencies.score,
          examDate: languageProficiencies.examDate,
          result: languageProficiencies.result,
          note: languageProficiencies.note,
          createdAt: languageProficiencies.createdAt,
        })
        .from(languageProficiencies)
        .leftJoin(students, eq(languageProficiencies.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .leftJoin(applicants, eq(languageProficiencies.applicantId, applicants.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(languageProficiencies.createdAt));
      return { items };
    });
  }

  /**
   * Dil yeterlilik kaydı oluştur (personel). Öğrenci veya aday varlığı doğrulanır;
   * sonuç puandan otomatik hesaplanır (>=65 muaf, 50-64 beklemede, <50 hazırlık).
   */
  async createProficiency(input: CreateProficiencyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Dil yeterlilik kaydı oluşturma yetkiniz yok');
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
      if (input.applicantId) {
        const [app] = await tx
          .select({ id: applicants.id })
          .from(applicants)
          .where(eq(applicants.id, input.applicantId))
          .limit(1);
        if (!app) {
          throw new NotFoundException('Aday bulunamadı');
        }
      }

      const result = resultForScore(input.score);
      const [row] = await tx
        .insert(languageProficiencies)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId ?? null,
          applicantId: input.applicantId ?? null,
          examType: input.examType,
          score: input.score !== undefined ? String(input.score) : null,
          examDate: input.examDate ?? null,
          result,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'language.proficiency.create',
        resourceType: 'language_proficiency',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId ?? null,
          applicantId: input.applicantId ?? null,
          examType: input.examType,
          score: input.score ?? null,
          result,
        },
      });

      return row!;
    });
  }

  /** Dil yeterlilik sonucunu elle güncelle (muaf/hazirlik/beklemede) + not. */
  async updateProficiency(
    id: string,
    input: UpdateProficiencyInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Dil yeterlilik güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const patch: Record<string, unknown> = { result: input.result };
      if (input.note !== undefined) patch.note = input.note;

      const [row] = await tx
        .update(languageProficiencies)
        .set(patch)
        .where(eq(languageProficiencies.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Dil yeterlilik kaydı bulunamadı');
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'language.proficiency.update',
        resourceType: 'language_proficiency',
        resourceId: row.id,
        diff: patch,
      });

      return row;
    });
  }

  /** Hazırlık programına düşen liste (result = "hazirlik"). */
  async prepList(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Hazırlık listesine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: languageProficiencies.id,
          studentId: languageProficiencies.studentId,
          studentNo: students.studentNo,
          studentName: users.email,
          applicantId: languageProficiencies.applicantId,
          applicantName: applicants.fullName,
          examType: languageProficiencies.examType,
          score: languageProficiencies.score,
          examDate: languageProficiencies.examDate,
          result: languageProficiencies.result,
          note: languageProficiencies.note,
          createdAt: languageProficiencies.createdAt,
        })
        .from(languageProficiencies)
        .leftJoin(students, eq(languageProficiencies.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .leftJoin(applicants, eq(languageProficiencies.applicantId, applicants.id))
        .where(eq(languageProficiencies.result, 'hazirlik'))
        .orderBy(desc(languageProficiencies.createdAt));
      return { items };
    });
  }
}
