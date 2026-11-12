import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyEnrollmentTransition,
  type ConditionNode,
  evaluateCondition,
  InvalidEnrollmentTransitionError,
  type EnrollmentStatus,
  maxEctsForGpa,
} from '@obs/academic-core';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { courses, curriculumCourses, programs, students } from '../db/schema-academic.js';
import { doubleMajorApplications } from '../db/schema-double-major.js';
import { grades } from '../db/schema-grades.js';
import { enrollments, sections } from '../db/schema-enrollment.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import {
  applyRequestTransition,
  InvalidRequestTransitionError,
  type RequestStatus,
} from '../requests/request-status.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';

// Öğrencinin kendisi yapabileceği geçişler (sahiplik gerekir) vs danışman geçişleri.
const STUDENT_ACTIONS = new Set(['gonder', 'sepetten_cikar', 'dersten_cekil', 'yeniden_duzenle']);
const ADVISOR_ACTIONS = new Set(['danisman_onayla', 'danisman_reddet', 'geri_gonder']);

// Portal ile aynı geniş personel seti (portal.service.ts STAFF ile birebir).
const STAFF_ROLES = [
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
const hasAny = (roles: ReadonlySet<string>, allowed: readonly string[]): boolean =>
  allowed.some((r) => roles.has(r));

// ÇAP onay/ret kararını verebilecek roller. Sekreter yalnızca gündeme alabilir.
const DM_DECISION_ROLES = ['oidb', 'sistem_yoneticisi', 'dekanlik'];

export interface EnrollResult {
  enrollmentId: string;
  filled: number;
}

/**
 * Ders kayıt servisi. KONTENJAN DOĞRULUĞU: koltuk edinimi atomik tek UPDATE
 * (filled+1 WHERE filled<quota) ile yapılır — asla read-then-write yarışı yok,
 * asla aşım/negatif (CHECK ile ikinci kilit). Koltuk + kayıt tek transaction'da:
 * kayıt başarısızsa (çift kayıt) koltuk geri döner.
 */
@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
    private readonly params: ParametersService,
  ) {}

  /**
   * Kayıt haftası canlı izleme: dönemin kontenjan doluluk + kayıt durumu özeti.
   * Yönetim dashboard'u ve sistem sağlığı ekranı bunu kullanır (§M9).
   */
  async termStats(termId: string): Promise<{
    sectionCount: number;
    totalQuota: number;
    totalFilled: number;
    fillRate: number;
    enrollmentsByStatus: Record<string, number>;
  }> {
    const { tenantId } = requireTenant();
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [agg] = await tx
        .select({
          sectionCount: count(),
          totalQuota: sql<number>`coalesce(sum(${sections.quota}), 0)::int`,
          totalFilled: sql<number>`coalesce(sum(${sections.filled}), 0)::int`,
        })
        .from(sections)
        .where(eq(sections.termId, termId));

      const statusRows = await tx
        .select({ status: enrollments.status, n: count() })
        .from(enrollments)
        .where(eq(enrollments.termId, termId))
        .groupBy(enrollments.status);

      const enrollmentsByStatus: Record<string, number> = {};
      for (const r of statusRows) {
        enrollmentsByStatus[r.status] = r.n;
      }

      const totalQuota = agg?.totalQuota ?? 0;
      const totalFilled = agg?.totalFilled ?? 0;
      return {
        sectionCount: agg?.sectionCount ?? 0,
        totalQuota,
        totalFilled,
        fillRate: totalQuota > 0 ? Math.round((totalFilled / totalQuota) * 1000) / 1000 : 0,
        enrollmentsByStatus,
      };
    });
  }

  /** Şubenin dönem kimliği (takvim penceresi kontrolü için). */
  async sectionTermId(sectionId: string): Promise<string | null> {
    const { tenantId } = requireTenant();
    const row = await withTenant(this.handle.db, tenantId, async (tx) => {
      const [s] = await tx
        .select({ termId: sections.termId })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      return s;
    });
    return row?.termId ?? null;
  }

  async enroll(studentId: string, sectionId: string, status = 'draft'): Promise<EnrollResult> {
    const ctx = requireTenant();
    const onDate = new Date().toISOString().slice(0, 10);

    // 0) Yetki + AKTS tavanı ön-kontrolü — koltuk EDİNMEDEN önce (ayrı okuma tx).
    //    Kontenjan atomikliği aşağıdaki tek-UPDATE'te korunur; AKTS ise soft
    //    akademik kural olduğundan pre-check yeterli.
    const pre = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ userId: students.userId, programId: students.programId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      // IDOR koruması: başka öğrenci adına kayıt yapılamaz (ÖİDB/sistem hariç).
      const roles = new Set(ctx.roles ?? []);
      if (!roles.has('oidb') && !roles.has('sistem_yoneticisi') && ctx.actorUserId !== stu.userId) {
        throw new ForbiddenException('Başka öğrenci adına kayıt yapamazsınız');
      }

      // Eklenecek dersin AKTS'i + dönemi.
      const [sec] = await tx
        .select({ termId: sections.termId, ects: courses.ects })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!sec) {
        throw new NotFoundException('Şube bulunamadı');
      }

      // Bu dönem hâlihazırda aktif kayıtların (taslak/gönderilmiş/onaylı) AKTS'i.
      const rows = await tx
        .select({ ects: courses.ects })
        .from(enrollments)
        .innerJoin(sections, eq(enrollments.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(enrollments.termId, sec.termId),
            inArray(enrollments.status, ['draft', 'submitted', 'approved']),
          ),
        );
      const currentEcts = rows.reduce((sum, r) => sum + r.ects, 0);
      return { programId: stu.programId, addEcts: sec.ects, currentEcts };
    });

    // Yürürlükteki kural seti (program-özel > tenant-geneli, tarihli) + GNO'ya göre
    // üst limit (boost). Kural seti tanımlı DEĞİLSE tavan uygulanmaz (graceful).
    let rules: Awaited<ReturnType<ParametersService['resolveRuleSet']>> | null = null;
    try {
      rules = await this.params.resolveRuleSet(ctx.tenantId, pre.programId, onDate);
    } catch (e) {
      if (!(e instanceof NotFoundException)) {
        throw e;
      }
    }
    if (rules) {
      const { gpa } = await this.gpa.computeStudentGpa(studentId, pre.programId, onDate);
      const ceiling = maxEctsForGpa(rules, gpa);
      if (pre.currentEcts + pre.addEcts > ceiling) {
        throw new ConflictException(
          `Dönemlik AKTS üst limiti aşılıyor (mevcut ${pre.currentEcts} + ${pre.addEcts} > ${ceiling})`,
        );
      }
    }

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // 1) Atomik koltuk edinimi. Dönen satır yoksa kontenjan dolu.
      const claimed = await tx
        .update(sections)
        .set({ filled: sql`${sections.filled} + 1` })
        .where(and(eq(sections.id, sectionId), sql`${sections.filled} < ${sections.quota}`))
        .returning({ filled: sections.filled, termId: sections.termId });

      if (claimed.length === 0) {
        throw new ConflictException('Kontenjan dolu');
      }
      const seat = claimed[0]!;

      // 2) Kayıt. Çift kayıt -> unique ihlali -> transaction geri alır (koltuk iadesi).
      try {
        const [enr] = await tx
          .insert(enrollments)
          .values({ tenantId: ctx.tenantId, studentId, sectionId, termId: seat.termId, status })
          .returning({ id: enrollments.id });
        return { enrollmentId: enr!.id, filled: seat.filled };
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Öğrenci bu şubeye zaten kayıtlı');
        }
        throw e;
      }
    });
  }

  /**
   * Kayıt durum geçişi (danışman onay akışı). Durum makinesi + yetki + koltuk
   * iadesi (ret/çekilme) + audit, tek transaction'da atomik.
   */
  async transition(
    enrollmentId: string,
    to: EnrollmentStatus,
    reason?: string,
  ): Promise<{ status: EnrollmentStatus; action: string }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    const actorUserId = ctx.actorUserId;

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          status: enrollments.status,
          sectionId: enrollments.sectionId,
          studentUserId: students.userId,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(eq(enrollments.id, enrollmentId))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Kayıt bulunamadı');
      }

      let transition: ReturnType<typeof applyEnrollmentTransition>;
      try {
        transition = applyEnrollmentTransition(row.status as EnrollmentStatus, to);
      } catch (e) {
        if (e instanceof InvalidEnrollmentTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }

      if (!authorizeEnrollment(transition.action, roles, actorUserId, row.studentUserId)) {
        throw new ForbiddenException('Bu işlem için yetkiniz yok');
      }

      // Koltuk iadesi (ret/çekilme): atomik ve guard'lı (filled>0).
      if (transition.releasesSeat) {
        await tx
          .update(sections)
          .set({ filled: sql`${sections.filled} - 1` })
          .where(and(eq(sections.id, row.sectionId), sql`${sections.filled} > 0`));
      }

      await tx.update(enrollments).set({ status: to }).where(eq(enrollments.id, enrollmentId));

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: actorUserId ?? null,
        action: `enrollment.${transition.action}`,
        resourceType: 'enrollment',
        resourceId: enrollmentId,
        diff: { status: { from: row.status, to }, reason: reason ?? null },
      });

      return { status: to, action: transition.action };
    });
  }

  /**
   * Bekleyen ders kayıt onay kuyruğu (submitted) — GERÇEK karar-destek verisiyle.
   * Her satır için: prereqOk (müfredat ön koşul ağacı öğrencinin geçtiği derslere
   * göre değerlendirilir), conflictOk (aynı dönem aynı dersten ikinci aktif kayıt yok),
   * quotaOk (şube kontenjanı dolu değil), advisorApproved (danışman onayı verildi mi),
   * attemptNo (öğrencinin bu dersteki kaçıncı denemesi). bolum_baskani yalnızca kendi
   * bölümünün programlarındaki kayıtları görür.
   */
  async pendingEnrollments(): Promise<{
    items: Array<{
      enrollmentId: string;
      studentId: string;
      studentNo: string;
      fullName: string | null;
      sectionId: string;
      courseCode: string;
      courseName: string;
      ects: number;
      submittedAt: Date;
      prereqOk: boolean;
      conflictOk: boolean;
      quotaOk: boolean;
      advisorApproved: boolean;
      attemptNo: number;
    }>;
    total: number;
    flaggedCount: number;
  }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    if (!hasAny(roles, STAFF_ROLES)) {
      throw new ForbiddenException('Bu uca yalnızca personel erişebilir');
    }

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // bolum_baskani kapsamı: kendi verdiği şubelerin programlarının bölümlerine ait
      // programlar. Geniş yetkili roller (ÖİDB vb.) tüm kuyruğu görür.
      const wideAccess = hasAny(roles, ['oidb', 'sistem_yoneticisi', 'rektorluk', 'dekanlik']);
      let scopedProgramIds: Set<string> | null = null;
      if (!wideAccess && roles.has('bolum_baskani') && ctx.actorUserId) {
        const deptRows = await tx
          .selectDistinct({ departmentId: programs.departmentId })
          .from(sections)
          .innerJoin(programs, eq(sections.programId, programs.id))
          .where(eq(sections.instructorUserId, ctx.actorUserId));
        const deptIds = deptRows.map((d) => d.departmentId);
        scopedProgramIds = new Set<string>();
        if (deptIds.length > 0) {
          const progRows = await tx
            .select({ id: programs.id })
            .from(programs)
            .where(inArray(programs.departmentId, deptIds));
          for (const p of progRows) {
            scopedProgramIds.add(p.id);
          }
        }
      }

      const rows = await tx
        .select({
          enrollmentId: enrollments.id,
          studentId: students.id,
          studentUserId: students.userId,
          studentProgramId: students.programId,
          curriculumVersionId: students.curriculumVersionId,
          studentNo: students.studentNo,
          fullName: users.email,
          sectionId: sections.id,
          sectionProgramId: sections.programId,
          quota: sections.quota,
          filled: sections.filled,
          courseId: courses.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          termId: enrollments.termId,
          submittedAt: enrollments.createdAt,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(sections, eq(enrollments.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(enrollments.status, 'submitted'))
        .orderBy(desc(enrollments.createdAt));

      const items: Array<{
        enrollmentId: string;
        studentId: string;
        studentNo: string;
        fullName: string | null;
        sectionId: string;
        courseCode: string;
        courseName: string;
        ects: number;
        submittedAt: Date;
        prereqOk: boolean;
        conflictOk: boolean;
        quotaOk: boolean;
        advisorApproved: boolean;
        attemptNo: number;
      }> = [];
      let flaggedCount = 0;

      // Öğrenci başına ağır hesapları (geçilen dersler) tek kez yapmak için önbellek.
      const passedCache = new Map<string, { passed: Set<string>; credit: number }>();

      for (const r of rows) {
        // bolum_baskani kapsam süzgeci.
        if (scopedProgramIds && !scopedProgramIds.has(r.studentProgramId)) {
          continue;
        }

        // 1) Ön koşul: müfredattaki ders için prerequisite ağacı değerlendirilir.
        let passed = passedCache.get(r.studentId);
        if (!passed) {
          const gradeRows = await tx
            .select({
              code: courses.code,
              ects: courses.ects,
              letter: grades.letter,
              coefficient: grades.coefficient,
            })
            .from(grades)
            .innerJoin(sections, eq(grades.sectionId, sections.id))
            .innerJoin(courses, eq(sections.courseId, courses.id))
            .where(
              and(
                eq(grades.studentId, r.studentId),
                inArray(grades.status, ['announced', 'finalized']),
              ),
            );
          const passedSet = new Set<string>();
          let credit = 0;
          for (const g of gradeRows) {
            // Muaf (MU) veya katsayısı pozitif (geçer) dersler başarılmış sayılır.
            if (g.letter === 'MU' || (g.coefficient !== null && g.coefficient > 0)) {
              passedSet.add(g.code);
              credit += g.ects;
            }
          }
          passed = { passed: passedSet, credit };
          passedCache.set(r.studentId, passed);
        }

        const [cc] = await tx
          .select({ prerequisite: curriculumCourses.prerequisite })
          .from(curriculumCourses)
          .where(
            and(
              eq(curriculumCourses.curriculumVersionId, r.curriculumVersionId),
              eq(curriculumCourses.courseId, r.courseId),
            ),
          )
          .limit(1);
        const prereqNode: ConditionNode | null = cc?.prerequisite ?? null;
        const prereqOk = prereqNode
          ? evaluateCondition(prereqNode, {
              passedCourses: passed.passed,
              earnedCredit: passed.credit,
              gpa: 0,
            })
          : true;

        // 2) Çakışma: aynı dönemde aynı derse ait BAŞKA aktif kayıt (draft/submitted/
        //    approved) varsa çift kayıt çakışması. Ders programı zaman-dilimi tablosu
        //    modelde olmadığından çakışma "aynı ders mükerrer kaydı" ile tespit edilir.
        const [dup] = await tx
          .select({ n: count() })
          .from(enrollments)
          .innerJoin(sections, eq(enrollments.sectionId, sections.id))
          .where(
            and(
              eq(enrollments.studentId, r.studentId),
              eq(enrollments.termId, r.termId),
              eq(sections.courseId, r.courseId),
              sql`${enrollments.id} <> ${r.enrollmentId}`,
              inArray(enrollments.status, ['draft', 'submitted', 'approved']),
            ),
          );
        const conflictOk = Number(dup?.n ?? 0) === 0;

        // 3) Kontenjan: şube dolu değil.
        const quotaOk = r.filled < r.quota;

        // 4) Danışman onayı: aynı öğrenci+ders için approved kayıt (danışman onay
        //    akışı sonrası) mevcut mu — bilgi amaçlı rozet.
        const [appr] = await tx
          .select({ n: count() })
          .from(enrollments)
          .innerJoin(sections, eq(enrollments.sectionId, sections.id))
          .where(
            and(
              eq(enrollments.studentId, r.studentId),
              eq(enrollments.termId, r.termId),
              eq(sections.courseId, r.courseId),
              eq(enrollments.status, 'approved'),
            ),
          );
        const advisorApproved = Number(appr?.n ?? 0) > 0;

        // 5) Deneme sayısı: bu ders için toplam not kaydı + 1 (bu kayıt dahil).
        const [att] = await tx
          .select({ n: count() })
          .from(grades)
          .innerJoin(sections, eq(grades.sectionId, sections.id))
          .where(and(eq(grades.studentId, r.studentId), eq(sections.courseId, r.courseId)));
        const attemptNo = Number(att?.n ?? 0) + 1;

        if (!prereqOk || !conflictOk || !quotaOk) {
          flaggedCount++;
        }

        items.push({
          enrollmentId: r.enrollmentId,
          studentId: r.studentId,
          studentNo: r.studentNo,
          fullName: r.fullName,
          sectionId: r.sectionId,
          courseCode: r.courseCode,
          courseName: r.courseName,
          ects: r.ects,
          submittedAt: r.submittedAt,
          prereqOk,
          conflictOk,
          quotaOk,
          advisorApproved,
          attemptNo,
        });
      }

      return { items, total: items.length, flaggedCount };
    });
  }

  /**
   * Şube kontenjanı güncelleme. Yalnız bölüm başkanı/koordinatör/ÖİDB; bölüm başkanı
   * ve koordinatör yalnızca KENDİ bölümünün (verdiği şubelerin bölümü) şubesini
   * değiştirebilir. Kontenjan mevcut doluluğun altına indirilemez (aşım koruması).
   * Audit zorunlu.
   */
  async updateSectionQuota(
    sectionId: string,
    quota: number,
  ): Promise<{ sectionId: string; quota: number; filled: number }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    if (!hasAny(roles, ['bolum_baskani', 'koordinator', 'oidb'])) {
      throw new ForbiddenException('Kontenjan güncelleme yetkiniz yok');
    }

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [sec] = await tx
        .select({
          quota: sections.quota,
          filled: sections.filled,
          programId: sections.programId,
        })
        .from(sections)
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!sec) {
        throw new NotFoundException('Şube bulunamadı');
      }

      // Bölüm kapsamı: ÖİDB geniş; bölüm başkanı/koordinatör yalnızca kendi bölümü.
      const wide = roles.has('oidb') || roles.has('sistem_yoneticisi');
      if (!wide) {
        const myDepts = await tx
          .selectDistinct({ departmentId: programs.departmentId })
          .from(sections)
          .innerJoin(programs, eq(sections.programId, programs.id))
          .where(eq(sections.instructorUserId, ctx.actorUserId ?? ''));
        const myDeptIds = new Set(myDepts.map((d) => d.departmentId));
        let sectionDeptId: string | null = null;
        if (sec.programId) {
          const [p] = await tx
            .select({ departmentId: programs.departmentId })
            .from(programs)
            .where(eq(programs.id, sec.programId))
            .limit(1);
          sectionDeptId = p?.departmentId ?? null;
        }
        if (!sectionDeptId || !myDeptIds.has(sectionDeptId)) {
          throw new ForbiddenException('Yalnızca kendi bölümünüzün şubesini güncelleyebilirsiniz');
        }
      }

      if (quota < sec.filled) {
        throw new ConflictException(
          `Kontenjan mevcut doluluğun (${sec.filled}) altına indirilemez`,
        );
      }

      await tx.update(sections).set({ quota }).where(eq(sections.id, sectionId));
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'section.kontenjan_guncelle',
        resourceType: 'section',
        resourceId: sectionId,
        diff: { quota: { from: sec.quota, to: quota } },
      });

      return { sectionId, quota, filled: sec.filled };
    });
  }

  /**
   * Şube açma (ders açma). Yalnız bölüm başkanı/koordinatör/ÖİDB. Aynı
   * courseId+termId+code'da şube zaten varsa 409 (unique 'sections_uq' ile de
   * korunur; race'te DB ihlali yine 409'a çevrilir). filled=0 ile açılır. Audit
   * zorunlu.
   */
  async createSection(input: {
    courseId: string;
    termId: string;
    code: string;
    quota: number;
  }): Promise<{ id: string; courseId: string; termId: string; code: string; quota: number; filled: number }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    if (!hasAny(roles, ['bolum_baskani', 'koordinator', 'oidb'])) {
      throw new ForbiddenException('Şube açma yetkiniz yok');
    }

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(
          and(
            eq(sections.courseId, input.courseId),
            eq(sections.termId, input.termId),
            eq(sections.code, input.code),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu ders/dönem için aynı kodlu şube zaten mevcut');
      }

      let created: { id: string; filled: number };
      try {
        const [row] = await tx
          .insert(sections)
          .values({
            tenantId: ctx.tenantId,
            courseId: input.courseId,
            termId: input.termId,
            code: input.code,
            quota: input.quota,
            filled: 0,
          })
          .returning({ id: sections.id, filled: sections.filled });
        created = row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu ders/dönem için aynı kodlu şube zaten mevcut');
        }
        throw e;
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'section.ac',
        resourceType: 'section',
        resourceId: created.id,
        diff: {
          courseId: input.courseId,
          termId: input.termId,
          code: input.code,
          quota: input.quota,
        },
      });

      return {
        id: created.id,
        courseId: input.courseId,
        termId: input.termId,
        code: input.code,
        quota: input.quota,
        filled: created.filled,
      };
    });
  }

  /**
   * ÇAP/Yandal başvuru durum geçişi (double-major.service.transition'ın yetki
   * genişletilmiş kopyası): fakülte sekreteri başvuruyu SADECE gündeme alabilir
   * (submitted->in_review, action 'incele'); onay/ret (approved/rejected) yalnız
   * ÖİDB|sistem_yoneticisi|dekanlik'ta kalır. İptal yalnız sahip öğrenci/karar rolü.
   */
  async doubleMajorTransition(
    applicationId: string,
    to: RequestStatus,
    reason?: string,
  ): Promise<{ id: string; status: RequestStatus }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    const canDecide = hasAny(roles, DM_DECISION_ROLES);
    const canReview = canDecide || roles.has('fakulte_sekreteri');

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [app] = await tx
        .select({
          status: doubleMajorApplications.status,
          ownerUserId: students.userId,
        })
        .from(doubleMajorApplications)
        .innerJoin(students, eq(doubleMajorApplications.studentId, students.id))
        .where(eq(doubleMajorApplications.id, applicationId))
        .limit(1);
      if (!app) {
        throw new NotFoundException('Başvuru bulunamadı');
      }

      let transition;
      try {
        transition = applyRequestTransition(app.status as RequestStatus, to);
      } catch (e) {
        if (e instanceof InvalidRequestTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }

      // Yetki matrisi:
      //  - iptal: sahip öğrenci veya karar rolü.
      //  - incele (submitted->in_review) / bilgi_iste: karar rolü + fakülte sekreteri.
      //  - onayla/reddet: yalnız karar rolü.
      if (transition.action === 'iptal') {
        if (!canDecide && ctx.actorUserId !== app.ownerUserId) {
          throw new ForbiddenException('Başkasının başvurusunu iptal edemezsiniz');
        }
      } else if (transition.action === 'onayla' || transition.action === 'reddet') {
        if (!canDecide) {
          throw new ForbiddenException('Onay/ret yetkisi yalnızca dekanlık/ÖİDB’dedir');
        }
      } else if (!canReview) {
        throw new ForbiddenException('Bu işlem için yetkiniz yok');
      }

      await tx
        .update(doubleMajorApplications)
        .set({
          status: to,
          reviewerUserId: canDecide ? (ctx.actorUserId ?? null) : null,
          decisionReason: reason ?? null,
        })
        .where(eq(doubleMajorApplications.id, applicationId));
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: `double_major.${transition.action}`,
        resourceType: 'double_major',
        resourceId: applicationId,
        diff: { status: { from: app.status, to }, reason: reason ?? null },
      });

      return { id: applicationId, status: to };
    });
  }
}

/**
 * Kayıt geçişi yetkisi. ÖİDB/sistem yöneticisi her şeyi; öğrenci eylemleri
 * yalnızca kendi kaydında; danışman eylemleri 'danisman' rolüyle.
 * (Danışman-öğrenci eşleşmesi ileride modellenince daraltılacak.)
 */
function authorizeEnrollment(
  action: string,
  roles: ReadonlySet<string>,
  actorUserId: string | undefined,
  ownerUserId: string,
): boolean {
  if (roles.has('oidb') || roles.has('sistem_yoneticisi')) {
    return true;
  }
  if (STUDENT_ACTIONS.has(action)) {
    return actorUserId !== undefined && actorUserId === ownerUserId;
  }
  if (ADVISOR_ACTIONS.has(action)) {
    return roles.has('danisman');
  }
  return false;
}
