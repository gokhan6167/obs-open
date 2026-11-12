import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyGradeTransition,
  InvalidGradeTransitionError,
  isContentLocked,
  type GradeStatus,
} from '@obs/academic-core';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { enrollments, sections } from '../db/schema-enrollment.js';
import {
  componentScores,
  gradeAppeals,
  gradeComponents,
  gradeCorrections,
  grades,
} from '../db/schema-grades.js';
import { gradeScales } from '../db/schema-parameters.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { EXAM_ADMIN, hasRole } from '../common/roles.js';
import { validateGradeRows, type BulkRowError, type RawGradeRow } from './bulk.js';

export interface SetGradeInput {
  studentId: string;
  sectionId: string;
  termId: string;
  rawScore: number;
  letter: string;
  coefficient: number;
  evaluationType?: 'absolute' | 'relative' | undefined;
}

export interface CorrectionInput {
  gradeId: string;
  newLetter: string;
  newRaw: number;
  newCoefficient: number;
  reason: string;
  decisionNo: string;
}

export interface OpenAppealInput {
  gradeId: string;
  reason: string;
}

export interface DecideAppealInput {
  decision: 'accepted' | 'rejected';
  note?: string | undefined;
}

export interface AppealRow {
  id: string;
  gradeId: string;
  studentNo: string;
  reason: string;
  status: string;
  letter: string | null;
  createdAt: Date;
}

export interface SectionComponent {
  id: string;
  name: string;
  weight: number;
  locked: boolean;
}

export interface RosterRow {
  studentId: string;
  studentNo: string;
  fullName: string;
  componentScores: { componentId: string; score: number }[];
  gradeId: string | null;
  rawScore: number | null;
  letter: string | null;
  coefficient: number | null;
  status: string | null;
}

export interface ActiveScale {
  code: string;
  name: string;
  evaluationType: 'absolute' | 'relative';
  bands: { min: number; letter: string; coef: number }[];
}

/**
 * Not servisi. Taslak notu serbestçe yazılır; İLAN sonrası içerik yalnızca
 * applyCorrection ile (gerekçe + karar no + audit) değişir. DB trigger sessiz
 * değişimi teknik olarak imkânsız kılar (0005).
 */
@Injectable()
export class GradesService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  private requireInstructorOrOidb(): {
    tenantId: string;
    actorUserId: string | undefined;
    roles: Set<string>;
  } {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    if (!roles.has('ogretim_elemani') && !roles.has('oidb') && !roles.has('sistem_yoneticisi')) {
      throw new ForbiddenException('Not işlemi için yetkiniz yok');
    }
    return { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, roles };
  }

  /**
   * Şube sahipliği: dersi veren hoca (sections.instructorUserId === aktör) veya
   * ÖİDB/sistem yöneticisi. Başka hocanın şubesine erişim reddedilir. Şube bulunamazsa 404.
   */
  private async assertSectionAccess(
    tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0],
    sectionId: string,
    actorUserId: string | undefined,
    roles: Set<string>,
  ): Promise<void> {
    const [sec] = await tx
      .select({ instructorUserId: sections.instructorUserId })
      .from(sections)
      .where(eq(sections.id, sectionId))
      .limit(1);
    if (!sec) {
      throw new NotFoundException('Şube bulunamadı');
    }
    if (roles.has('oidb') || roles.has('sistem_yoneticisi')) {
      return;
    }
    if (!actorUserId || sec.instructorUserId !== actorUserId) {
      throw new ForbiddenException('Bu şube üzerinde yetkiniz yok');
    }
  }

  /**
   * Bir şubenin not bileşenleri (vize/ödev/final). İçe-aktar sayfasında elle UUID
   * yapıştırmayı ortadan kaldırır; Not Girişi'nde bileşen sütunlarını besler.
   */
  async sectionComponents(
    sectionId: string,
  ): Promise<{ items: SectionComponent[]; totalWeight: number }> {
    const { tenantId, actorUserId, roles } = this.requireInstructorOrOidb();
    return withTenant(this.handle.db, tenantId, async (tx) => {
      await this.assertSectionAccess(tx, sectionId, actorUserId, roles);
      const items = await tx
        .select({
          id: gradeComponents.id,
          name: gradeComponents.name,
          weight: gradeComponents.weight,
          locked: gradeComponents.locked,
        })
        .from(gradeComponents)
        .where(eq(gradeComponents.sectionId, sectionId))
        .orderBy(asc(gradeComponents.name));
      const totalWeight = items.reduce((sum, c) => sum + c.weight, 0);
      return { items, totalWeight };
    });
  }

  /**
   * Şubeye GERÇEKTEN kayıtlı (enrollments) öğrenciler + varsa bileşen puanları +
   * hesaplanmış ders-sonu notu (gradeId/rawScore/letter/status). Not Girişi/Öğrenci
   * Listesi/Not Düzeltme'nin gerçek listeye ve gradeId'ye (satıra 'Düzelt') kavuşmasını sağlar.
   */
  async sectionRoster(sectionId: string): Promise<{ items: RosterRow[] }> {
    const { tenantId, actorUserId, roles } = this.requireInstructorOrOidb();
    return withTenant(this.handle.db, tenantId, async (tx) => {
      await this.assertSectionAccess(tx, sectionId, actorUserId, roles);

      const enrolled = await tx
        .select({
          studentId: students.id,
          studentNo: students.studentNo,
          fullName: users.email,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(enrollments.sectionId, sectionId))
        .orderBy(asc(students.studentNo));
      if (enrolled.length === 0) {
        return { items: [] };
      }
      const studentIds = enrolled.map((e) => e.studentId);

      const gradeRows = await tx
        .select({
          id: grades.id,
          studentId: grades.studentId,
          rawScore: grades.rawScore,
          letter: grades.letter,
          coefficient: grades.coefficient,
          status: grades.status,
        })
        .from(grades)
        .where(and(eq(grades.sectionId, sectionId), inArray(grades.studentId, studentIds)));
      const gradeByStudent = new Map(gradeRows.map((g) => [g.studentId, g]));

      // Bu şubenin bileşenlerine ait puanlar; öğrenci bazında grupla.
      const scoreRows = await tx
        .select({
          studentId: componentScores.studentId,
          componentId: componentScores.componentId,
          score: componentScores.score,
        })
        .from(componentScores)
        .innerJoin(gradeComponents, eq(componentScores.componentId, gradeComponents.id))
        .where(
          and(
            eq(gradeComponents.sectionId, sectionId),
            inArray(componentScores.studentId, studentIds),
          ),
        );
      const scoresByStudent = new Map<string, { componentId: string; score: number }[]>();
      for (const s of scoreRows) {
        const arr = scoresByStudent.get(s.studentId) ?? [];
        arr.push({ componentId: s.componentId, score: s.score });
        scoresByStudent.set(s.studentId, arr);
      }

      const items: RosterRow[] = enrolled.map((e) => {
        const g = gradeByStudent.get(e.studentId);
        return {
          studentId: e.studentId,
          studentNo: e.studentNo,
          fullName: e.fullName,
          componentScores: scoresByStudent.get(e.studentId) ?? [],
          gradeId: g?.id ?? null,
          rawScore: g?.rawScore ?? null,
          letter: g?.letter ?? null,
          coefficient: g?.coefficient ?? null,
          status: g?.status ?? null,
        };
      });
      return { items };
    });
  }

  /**
   * Aktif harf notu ölçeği (hafif okuma ucu). Frontend'in HARDCODED YÖK band tablosu
   * yerine kurumun gerçek/aktif ölçeğini kullanması için. Parametre ucu requireAdmin
   * olduğundan personele (isStaff) açık bu hafif uç gerekir.
   */
  async activeScale(): Promise<ActiveScale> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    // isStaff — hassas idari değil, sadece aktif ölçek okuma.
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
    if (!STAFF.some((r) => roles.has(r))) {
      throw new ForbiddenException('Aktif ölçeği görmek için personel yetkisi gerekir');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // Tenant-geneli (programId NULL) aktif ölçeği tercih et; yoksa herhangi aktif.
      const rows = await tx
        .select({
          code: gradeScales.code,
          name: gradeScales.name,
          bands: gradeScales.bands,
          programId: gradeScales.programId,
        })
        .from(gradeScales)
        .where(eq(gradeScales.isActive, true));
      if (rows.length === 0) {
        throw new NotFoundException('Aktif harf notu ölçeği yok');
      }
      const chosen = rows.find((r) => r.programId === null) ?? rows[0]!;
      const bands = [...chosen.bands]
        .sort((a, b) => b.minScore - a.minScore)
        .map((b) => ({ min: b.minScore, letter: b.letter, coef: b.coefficient }));
      // Ölçekte değerlendirme tipi tutulmaz; kurum notlarında varsayılan 'absolute'.
      return { code: chosen.code, name: chosen.name, evaluationType: 'absolute' as const, bands };
    });
  }

  /** Taslak not gir/güncelle (upsert). İlan edilmiş nota bu yolla dokunulamaz. */
  async setDraftGrade(input: SetGradeInput): Promise<{ id: string; status: GradeStatus }> {
    const { tenantId } = this.requireInstructorOrOidb();
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: grades.id, status: grades.status })
        .from(grades)
        .where(eq(grades.studentId, input.studentId))
        .limit(1);

      if (existing && isContentLocked(existing.status as GradeStatus)) {
        throw new ConflictException('Not ilan edildi; içerik yalnızca düzeltme akışıyla değişir');
      }

      if (existing) {
        await tx
          .update(grades)
          .set({
            rawScore: input.rawScore,
            letter: input.letter,
            coefficient: input.coefficient,
            evaluationType: input.evaluationType ?? 'absolute',
          })
          .where(eq(grades.id, existing.id));
        return { id: existing.id, status: existing.status as GradeStatus };
      }

      const [created] = await tx
        .insert(grades)
        .values({
          tenantId,
          studentId: input.studentId,
          sectionId: input.sectionId,
          termId: input.termId,
          rawScore: input.rawScore,
          letter: input.letter,
          coefficient: input.coefficient,
          evaluationType: input.evaluationType ?? 'absolute',
        })
        .returning({ id: grades.id });
      return { id: created!.id, status: 'draft' };
    });
  }

  /** Şubeye kayıtlı öğrenciler (Excel şablonu için). */
  async sectionStudents(sectionId: string): Promise<{ studentNo: string; name: string }[]> {
    const { tenantId } = this.requireInstructorOrOidb();
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .select({ studentNo: students.studentNo, name: users.email })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(enrollments.sectionId, sectionId)),
    );
    return rows;
  }

  /**
   * Toplu bileşen notu girişi. Hatalı satırlar rapora düşer (§M4 "hatalı satır
   * raporuyla"); geçerliler upsert edilir. Bilinmeyen öğrenci no da hata olur.
   */
  async bulkImportComponentScores(
    componentId: string,
    rows: readonly RawGradeRow[],
  ): Promise<{ imported: number; errors: BulkRowError[] }> {
    const { tenantId } = this.requireInstructorOrOidb();
    const { valid, errors } = validateGradeRows(rows, { min: 0, max: 100 });
    const allErrors: BulkRowError[] = [...errors];
    let imported = 0;

    await withTenant(this.handle.db, tenantId, async (tx) => {
      for (const row of valid) {
        const [stu] = await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.studentNo, row.studentNo))
          .limit(1);
        if (!stu) {
          allErrors.push({ index: -1, studentNo: row.studentNo, reason: 'öğrenci bulunamadı' });
          continue;
        }
        await tx
          .insert(componentScores)
          .values({ tenantId, componentId, studentId: stu.id, score: row.score })
          .onConflictDoUpdate({
            target: [componentScores.componentId, componentScores.studentId],
            set: { score: row.score },
          });
        imported += 1;
      }
    });

    return { imported, errors: allErrors };
  }

  /** Durum geçişi (ilan et / kesinleştir). İçerik değişmez. */
  async transition(gradeId: string, to: GradeStatus): Promise<{ status: GradeStatus }> {
    const { tenantId, actorUserId } = this.requireInstructorOrOidb();
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: grades.status })
        .from(grades)
        .where(eq(grades.id, gradeId))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Not bulunamadı');
      }
      let transition;
      try {
        transition = applyGradeTransition(row.status as GradeStatus, to);
      } catch (e) {
        if (e instanceof InvalidGradeTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }
      await tx.update(grades).set({ status: to }).where(eq(grades.id, gradeId));
      await tx.insert(auditLog).values({
        tenantId,
        actorUserId: actorUserId ?? null,
        action: `grade.${transition.action}`,
        resourceType: 'grade',
        resourceId: gradeId,
        diff: { status: { from: row.status, to } },
      });
      return { status: to };
    });
  }

  /**
   * İlan edilmiş notta düzeltme — içerik değişiminin TEK yolu. Karar no + gerekçe
   * zorunlu; düzeltme kaydı + audit yazılır; DB trigger'ı app.grade_correction ile
   * bilinçli olarak açar. ÖİDB/sistem yöneticisi yetkisi gerekir.
   */
  async applyCorrection(input: CorrectionInput): Promise<{ gradeId: string }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    if (!roles.has('oidb') && !roles.has('sistem_yoneticisi')) {
      throw new ForbiddenException('Not düzeltme yalnızca ÖİDB/sistem yöneticisi yetkisiyle');
    }
    if (!input.reason.trim() || !input.decisionNo.trim()) {
      throw new ConflictException('Düzeltme için gerekçe ve karar no zorunludur');
    }

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          status: grades.status,
          letter: grades.letter,
          raw: grades.rawScore,
          coef: grades.coefficient,
        })
        .from(grades)
        .where(eq(grades.id, input.gradeId))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Not bulunamadı');
      }
      if (!isContentLocked(row.status as GradeStatus)) {
        throw new ConflictException('Düzeltme yalnızca ilan/kesin nota uygulanır (taslakta doğrudan düzenleyin)');
      }

      // Trigger'ı bilinçli aç: bu transaction'da içerik değişimine izin ver.
      await tx.execute(sql`select set_config('app.grade_correction', 'on', true)`);

      await tx
        .update(grades)
        .set({ letter: input.newLetter, rawScore: input.newRaw, coefficient: input.newCoefficient })
        .where(eq(grades.id, input.gradeId));

      await tx.insert(gradeCorrections).values({
        tenantId: ctx.tenantId,
        gradeId: input.gradeId,
        oldLetter: row.letter,
        newLetter: input.newLetter,
        oldRaw: row.raw,
        newRaw: input.newRaw,
        reason: input.reason,
        decisionNo: input.decisionNo,
        approvedByUserId: ctx.actorUserId ?? null,
      });

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'grade.duzeltme',
        resourceType: 'grade',
        resourceId: input.gradeId,
        diff: {
          letter: { from: row.letter, to: input.newLetter },
          raw: { from: row.raw, to: input.newRaw },
          decisionNo: input.decisionNo,
          reason: input.reason,
        },
      });

      return { gradeId: input.gradeId };
    });
  }

  /** Aktör kullanıcıya bağlı öğrenci kaydı (kendi notuna itiraz için). */
  private async myStudentId(
    tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0],
    actorUserId: string | undefined,
  ): Promise<string | null> {
    if (!actorUserId) {
      return null;
    }
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, actorUserId))
      .limit(1);
    return s?.id ?? null;
  }

  /**
   * Not itirazı AÇ — öğrenci yalnızca kendi İLAN EDİLMİŞ notuna (itiraz penceresi).
   * Aynı not için açık itiraz varsa tekrarlanamaz. Taslak/kesinleşmemiş nota açılmaz.
   */
  async openAppeal(input: OpenAppealInput): Promise<{ id: string; status: string }> {
    const ctx = requireTenant();
    if (!input.reason.trim()) {
      throw new ConflictException('İtiraz gerekçesi zorunludur');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('İtiraz yalnızca öğrenci kendi notu için açabilir');
      }
      const [g] = await tx
        .select({ studentId: grades.studentId, status: grades.status })
        .from(grades)
        .where(eq(grades.id, input.gradeId))
        .limit(1);
      if (!g) {
        throw new NotFoundException('Not bulunamadı');
      }
      if (g.studentId !== sid) {
        throw new ForbiddenException('Yalnızca kendi notunuza itiraz edebilirsiniz');
      }
      if (!isContentLocked(g.status as GradeStatus)) {
        throw new ConflictException('İtiraz yalnızca ilan edilmiş nota açılır');
      }
      const [existing] = await tx
        .select({ id: gradeAppeals.id })
        .from(gradeAppeals)
        .where(and(eq(gradeAppeals.gradeId, input.gradeId), eq(gradeAppeals.status, 'open')))
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu not için zaten açık bir itiraz var');
      }
      const [created] = await tx
        .insert(gradeAppeals)
        .values({
          tenantId: ctx.tenantId,
          gradeId: input.gradeId,
          studentId: sid,
          reason: input.reason,
        })
        .returning({ id: gradeAppeals.id });
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'grade.itiraz_acildi',
        resourceType: 'grade_appeal',
        resourceId: created!.id,
        diff: { gradeId: input.gradeId, reason: input.reason },
      });
      return { id: created!.id, status: 'open' };
    });
  }

  /** İtiraz kuyruğu (personel; opsiyonel status filtresi). Öğrenci no + not harfi ile. */
  async listAppeals(status?: string): Promise<AppealRow[]> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, EXAM_ADMIN)) {
      throw new ForbiddenException('İtiraz kuyruğu için yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      return tx
        .select({
          id: gradeAppeals.id,
          gradeId: gradeAppeals.gradeId,
          studentNo: students.studentNo,
          reason: gradeAppeals.reason,
          status: gradeAppeals.status,
          letter: grades.letter,
          createdAt: gradeAppeals.createdAt,
        })
        .from(gradeAppeals)
        .innerJoin(students, eq(gradeAppeals.studentId, students.id))
        .innerJoin(grades, eq(gradeAppeals.gradeId, grades.id))
        .where(status ? eq(gradeAppeals.status, status) : undefined)
        .orderBy(desc(gradeAppeals.createdAt));
    });
  }

  /**
   * İtirazı KARARA BAĞLA (kabul/ret + audit) — açık itiraz akışını kapatan uç.
   * Not, yalnızca açık bir itiraz için ve bir kez karara bağlanabilir. Kabul edilen
   * itirazda not İÇERİĞİ hâlâ tek sanctioned yolla (applyCorrection: karar no+trigger)
   * değişir; bu uç kararı ve izini kaydeder, sessiz içerik değişimi yapmaz.
   */
  async decideAppeal(
    appealId: string,
    input: DecideAppealInput,
  ): Promise<{ id: string; status: string }> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, EXAM_ADMIN)) {
      throw new ForbiddenException('İtiraz kararı için yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: gradeAppeals.status, gradeId: gradeAppeals.gradeId })
        .from(gradeAppeals)
        .where(eq(gradeAppeals.id, appealId))
        .limit(1);
      if (!row) {
        throw new NotFoundException('İtiraz bulunamadı');
      }
      if (row.status !== 'open') {
        throw new ConflictException('İtiraz zaten karara bağlanmış');
      }
      await tx.update(gradeAppeals).set({ status: input.decision }).where(eq(gradeAppeals.id, appealId));
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: input.decision === 'accepted' ? 'grade.itiraz_kabul' : 'grade.itiraz_ret',
        resourceType: 'grade_appeal',
        resourceId: appealId,
        diff: { gradeId: row.gradeId, note: input.note ?? null },
      });
      return { id: appealId, status: input.decision };
    });
  }
}
