import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { thesisTopics } from '../db/schema-services.js';
import {
  plagiarismReports,
  qualificationExams,
  thesisCommittees,
  thesisDefenses,
  thesisProgress,
} from '../db/schema-graduate.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GRADUATE_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma/yazma yetkisi (thesis.service STAFF ile bire bir).
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

/** İntihal varsayılan benzerlik eşiği (%). */
const DEFAULT_THRESHOLD_PCT = 20;
/** Yeterlilik sınavı geçme puanı (yazılı ve sözlü ayrı ayrı). */
const QUALIFICATION_PASS = 70;

export interface AddCommitteeInput {
  memberUserId?: string | undefined;
  memberName?: string | undefined;
  role: 'danisman' | 'uye' | 'baskan';
}

export interface AddProgressInput {
  period: string;
  meetingDate?: string | undefined;
  result: 'basarili' | 'basarisiz' | 'beklemede';
  note?: string | undefined;
}

export interface AddPlagiarismInput {
  similarityPct: number;
  thresholdPct?: number | undefined;
  reportUrl?: string | undefined;
}

export interface PlanDefenseInput {
  defenseDate: string;
  location?: string | undefined;
  jury?: unknown[] | undefined;
  decisionNo?: string | undefined;
  note?: string | undefined;
}

export interface DecideDefenseInput {
  result: 'basarili' | 'duzeltme' | 'red';
  note?: string | undefined;
}

export interface CreateQualificationInput {
  studentId: string;
  examDate?: string | undefined;
  writtenScore?: number | undefined;
  oralScore?: number | undefined;
  jury?: unknown[] | undefined;
  note?: string | undefined;
}

/** Yeterlilik sonucu: iki puan da >=70 → başarılı, ikisi de girilip altındaysa başarısız, eksikse beklemede. */
const qualificationResult = (written?: number, oral?: number): string => {
  if (written === undefined || oral === undefined) return 'beklemede';
  return written >= QUALIFICATION_PASS && oral >= QUALIFICATION_PASS ? 'basarili' : 'basarisiz';
};

/**
 * Lisansüstü tez süreci servisi (0022). Tenant-kapsamlı (RLS). TİK üyeleri,
 * izleme raporları, intihal raporu, savunma ve yeterlilik sınavı personel
 * yetkisi ister; tez sahibi öğrenci yalnızca kendi tezinin sürecini görebilir.
 */
@Injectable()
export class ThesisProcessService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Tezin tüm süreci: TİK üyeleri + izleme + intihal + savunma (sahibi öğrenci veya personel). */
  async detail(thesisId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [thesis] = await tx
        .select({ id: thesisTopics.id, studentId: thesisTopics.studentId })
        .from(thesisTopics)
        .where(eq(thesisTopics.id, thesisId))
        .limit(1);
      if (!thesis) {
        throw new NotFoundException('Tez bulunamadı');
      }
      if (!isStaff(ctx.roles ?? [])) {
        const sid = await this.myStudentId(tx, ctx.actorUserId);
        if (!sid || sid !== thesis.studentId) {
          throw new ForbiddenException('Bu tezin sürecine erişim yetkiniz yok');
        }
      }

      const committee = await tx
        .select({
          id: thesisCommittees.id,
          memberUserId: thesisCommittees.memberUserId,
          memberName: thesisCommittees.memberName,
          memberEmail: users.email,
          role: thesisCommittees.role,
          createdAt: thesisCommittees.createdAt,
        })
        .from(thesisCommittees)
        .leftJoin(users, eq(thesisCommittees.memberUserId, users.id))
        .where(eq(thesisCommittees.thesisId, thesisId))
        .orderBy(asc(thesisCommittees.createdAt));

      const progress = await tx
        .select()
        .from(thesisProgress)
        .where(eq(thesisProgress.thesisId, thesisId))
        .orderBy(desc(thesisProgress.createdAt));

      const plagiarism = await tx
        .select()
        .from(plagiarismReports)
        .where(eq(plagiarismReports.thesisId, thesisId))
        .orderBy(desc(plagiarismReports.createdAt));

      const defense = await tx
        .select()
        .from(thesisDefenses)
        .where(eq(thesisDefenses.thesisId, thesisId))
        .orderBy(desc(thesisDefenses.createdAt));

      return { committee, progress, plagiarism, defense };
    });
  }

  /** TİK (tez izleme komitesi) üyesi ekle — lisansüstü yetkilileri. */
  async addCommittee(
    thesisId: string,
    input: AddCommitteeInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('TİK üyesi ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.requireThesis(tx, thesisId);
      const [row] = await tx
        .insert(thesisCommittees)
        .values({
          tenantId: ctx.tenantId,
          thesisId,
          memberUserId: input.memberUserId ?? null,
          memberName: input.memberName ?? null,
          role: input.role,
        })
        .returning();
      return row!;
    });
  }

  /** TİK izleme raporu ekle — lisansüstü yetkilileri. */
  async addProgress(thesisId: string, input: AddProgressInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('İzleme raporu ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.requireThesis(tx, thesisId);
      const [row] = await tx
        .insert(thesisProgress)
        .values({
          tenantId: ctx.tenantId,
          thesisId,
          period: input.period,
          meetingDate: input.meetingDate ?? null,
          result: input.result,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** İntihal raporu ekle — lisansüstü yetkilileri. passed = benzerlik <= eşik (varsayılan %20). */
  async addPlagiarism(
    thesisId: string,
    input: AddPlagiarismInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('İntihal raporu ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.requireThesis(tx, thesisId);
      const threshold = input.thresholdPct ?? DEFAULT_THRESHOLD_PCT;
      const [row] = await tx
        .insert(plagiarismReports)
        .values({
          tenantId: ctx.tenantId,
          thesisId,
          similarityPct: String(input.similarityPct),
          thresholdPct: String(threshold),
          passed: input.similarityPct <= threshold,
          reportUrl: input.reportUrl ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Savunma planla — lisansüstü yetkilileri. Son intihal raporu yoksa veya eşik aşılmışsa 409. */
  async planDefense(thesisId: string, input: PlanDefenseInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('Savunma planlama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.requireThesis(tx, thesisId);
      const [report] = await tx
        .select({ passed: plagiarismReports.passed })
        .from(plagiarismReports)
        .where(eq(plagiarismReports.thesisId, thesisId))
        .orderBy(desc(plagiarismReports.createdAt))
        .limit(1);
      if (!report || report.passed !== true) {
        throw new ConflictException(
          'İntihal raporu olmadan/eşik aşılmışken savunma planlanamaz',
        );
      }
      const [row] = await tx
        .insert(thesisDefenses)
        .values({
          tenantId: ctx.tenantId,
          thesisId,
          defenseDate: input.defenseDate,
          location: input.location ?? null,
          jury: input.jury ?? null,
          result: 'beklemede',
          decisionNo: input.decisionNo ?? null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Savunma sonucu (başarılı/düzeltme/red) — lisansüstü yetkilileri. */
  async decideDefense(id: string, input: DecideDefenseInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('Savunma sonucu girme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const patch: Record<string, unknown> = { result: input.result };
      if (input.note !== undefined) patch.note = input.note;
      const [row] = await tx
        .update(thesisDefenses)
        .set(patch)
        .where(eq(thesisDefenses.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Savunma kaydı bulunamadı');
      }
      return row;
    });
  }

  /** Yeterlilik sınavı kayıtları (opsiyonel öğrenci filtresi) — personel. */
  async qualifications(studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Yeterlilik sınavı kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: qualificationExams.id,
          studentId: qualificationExams.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          examDate: qualificationExams.examDate,
          writtenScore: qualificationExams.writtenScore,
          oralScore: qualificationExams.oralScore,
          result: qualificationExams.result,
          attemptNo: qualificationExams.attemptNo,
          jury: qualificationExams.jury,
          note: qualificationExams.note,
          createdAt: qualificationExams.createdAt,
        })
        .from(qualificationExams)
        .innerJoin(students, eq(qualificationExams.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(studentId ? eq(qualificationExams.studentId, studentId) : undefined)
        .orderBy(desc(qualificationExams.createdAt));
      return { items };
    });
  }

  /** Yeterlilik sınavı kaydı — lisansüstü yetkilileri. attemptNo otomatik artar, sonuç puanlardan hesaplanır. */
  async createQualification(
    input: CreateQualificationInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('Yeterlilik sınavı kaydı oluşturma yetkiniz yok');
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

      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(qualificationExams)
        .where(eq(qualificationExams.studentId, input.studentId));

      const [row] = await tx
        .insert(qualificationExams)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          examDate: input.examDate ?? null,
          writtenScore: input.writtenScore !== undefined ? String(input.writtenScore) : null,
          oralScore: input.oralScore !== undefined ? String(input.oralScore) : null,
          result: qualificationResult(input.writtenScore, input.oralScore),
          attemptNo: (counted?.count ?? 0) + 1,
          jury: input.jury ?? null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Tez var mı (tenant içinde); yoksa 404. */
  private async requireThesis(tx: Tx, thesisId: string): Promise<void> {
    const [thesis] = await tx
      .select({ id: thesisTopics.id })
      .from(thesisTopics)
      .where(eq(thesisTopics.id, thesisId))
      .limit(1);
    if (!thesis) {
      throw new NotFoundException('Tez bulunamadı');
    }
  }

  private async myStudentId(tx: Tx, actorUserId?: string): Promise<string | null> {
    if (!actorUserId) return null;
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, actorUserId))
      .limit(1);
    return s?.id ?? null;
  }
}
