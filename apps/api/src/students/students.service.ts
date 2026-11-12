import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { applyTransition, InvalidStatusTransitionError, type StudentStatus } from '@obs/academic-core';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { hasRole, STUDENT_ADMIN } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, roles, userRoles, users } from '../db/schema.js';
import {
  academicTerms,
  courses,
  curriculumCourses,
  curriculumVersions,
  programs,
  students,
} from '../db/schema-academic.js';
import { sections } from '../db/schema-enrollment.js';
import { grades } from '../db/schema-grades.js';
import { invoices } from '../db/schema-finance.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { authorize, type Actor } from '../rbac/authorize.js';
import { OBS_AUTHORIZE_CONFIG } from '../rbac/matrix.js';
import { GpaService } from '../grades/gpa.service.js';

export interface StudentView {
  id: string;
  studentNo: string;
  status: string;
  programId: string;
  programName: string;
  enrolledAt: Date;
  classYear: number;
  advisorName: string | null;
  currentTermCredits: number;
}

// Geçmez notlar (graduation.service ile hizalı): kazanılan AKTS bunları saymaz.
const FAIL_LETTERS = new Set(['FF', 'NA', 'DZ']);

// Personel okuma yetkisi (isStaff) — portal.service.ts STAFF ile bire bir.
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

// Fakülte geneli okuma yapabilen (öğrenci-bazlı kısıtı olmayan) idari roller.
const BROAD_STAFF = [
  'oidb',
  'sistem_yoneticisi',
  'rektorluk',
  'dekanlik',
  'fakulte_sekreteri',
  'koordinator',
  'mali_isler',
];
const isBroadStaff = (roles: readonly string[] = []): boolean =>
  roles.some((r) => BROAD_STAFF.includes(r));

// Program seviyesine göre standart öğrenim + azami süre (yıl). VARSAYIM: mevzuat
// azami süresi henüz parametreleştirilmedi (academic_rule_sets'te alan yok); YÖK
// tipik değerleri kullanılır. Parametre eklenince buradan resolveRuleSet'e taşınır.
const MAX_YEARS_BY_LEVEL: Record<string, number> = {
  onlisans: 4,
  lisans: 7,
  yuksek_lisans: 3,
  doktora: 6,
};

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

interface StudentRow {
  id: string;
  userId: string;
  studentNo: string;
  status: string;
  programId: string;
  curriculumVersionId: string;
  enrolledAt: Date;
  tenantId: string;
}

/**
 * Öğrenci servisi. Durum geçişleri SADECE durum makinesi + yetki + audit ile
 * yapılır (M1). Serbest status update yoktur; her şey tek transaction'da atomik.
 *
 * Okuma uçları (profil/360/not/timeline) personel kapsamlıdır; danışman/hoca
 * yalnızca KENDİ öğrencisini (verdiği şubede notu olan) görür, bölüm başkanı
 * kendi bölümü programlarındaki öğrenciyi görür, öğrenci ise yalnız kendi kaydını.
 */
@Injectable()
export class StudentsService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
  ) {}

  private actor(): Actor {
    const ctx = requireTenant();
    return {
      userId: ctx.actorUserId ?? 'anonim',
      tenantId: ctx.tenantId,
      roles: ctx.roles ?? [],
    };
  }

  private async loadStudent(tx: Tx, id: string): Promise<StudentRow> {
    const [s] = await tx
      .select({
        id: students.id,
        userId: students.userId,
        studentNo: students.studentNo,
        status: students.status,
        programId: students.programId,
        curriculumVersionId: students.curriculumVersionId,
        enrolledAt: students.enrolledAt,
        tenantId: students.tenantId,
      })
      .from(students)
      .where(eq(students.id, id))
      .limit(1);
    if (!s) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
    return s;
  }

  /**
   * Okuma kapsamı kontrolü: personel dışı erişim yok; danışman/hoca yalnızca
   * kendi öğrencisi; bölüm başkanı yalnızca kendi bölümü; öğrenci kendi kaydı.
   * Yetkisiz -> ForbiddenException.
   */
  private async assertReadScope(tx: Tx, ctx: ReturnType<typeof requireTenant>, stu: StudentRow): Promise<void> {
    const roles = ctx.roles ?? [];
    const actorUserId = ctx.actorUserId ?? null;

    // Öğrenci kendi kaydı (sahiplik).
    if (actorUserId && actorUserId === stu.userId) {
      return;
    }
    if (!isStaff(roles)) {
      throw new ForbiddenException('Bu öğrenci verisine erişim yetkiniz yok');
    }
    // Fakülte geneli idari roller: kısıt yok.
    if (isBroadStaff(roles)) {
      return;
    }
    if (!actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }

    // Bölüm başkanı: kendi bölümü programlarındaki öğrenci. Bölüm eşlemesi ayrı
    // tablo GEREKTİRMEDEN, başkanın ders verdiği şubelerin bölümlerinden çözülür.
    if (roles.includes('bolum_baskani')) {
      const [studentDept] = await tx
        .select({ departmentId: programs.departmentId })
        .from(programs)
        .where(eq(programs.id, stu.programId))
        .limit(1);
      if (studentDept) {
        const chairDepts = await tx
          .selectDistinct({ departmentId: programs.departmentId })
          .from(sections)
          .innerJoin(programs, eq(sections.programId, programs.id))
          .where(eq(sections.instructorUserId, actorUserId));
        if (chairDepts.some((d) => d.departmentId === studentDept.departmentId)) {
          return;
        }
      }
    }

    // Danışman/hoca: yalnızca verdiği bir şubede notu olan öğrenci.
    const [taught] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(grades)
      .innerJoin(sections, eq(grades.sectionId, sections.id))
      .where(and(eq(grades.studentId, stu.id), eq(sections.instructorUserId, actorUserId)));
    if ((taught?.n ?? 0) > 0) {
      return;
    }

    throw new ForbiddenException('Yalnızca kendi öğrencinizin verisine erişebilirsiniz');
  }

  private async advisorName(tx: Tx, studentId: string): Promise<string | null> {
    // Danışman eşleme tablosu yok; öğrencinin en güncel dönemde ders aldığı
    // şubenin öğretim elemanını "danışman" muadili olarak gösteririz (pragmatik).
    const [row] = await tx
      .select({ email: users.email })
      .from(grades)
      .innerJoin(sections, eq(grades.sectionId, sections.id))
      .innerJoin(users, eq(sections.instructorUserId, users.id))
      .innerJoin(academicTerms, eq(grades.termId, academicTerms.id))
      .where(eq(grades.studentId, studentId))
      .orderBy(desc(academicTerms.year))
      .limit(1);
    return row?.email ?? null;
  }

  /** Aktif dönemde öğrencinin ders yükü (yerel kredi toplamı). */
  private async currentTermCredits(tx: Tx, studentId: string): Promise<number> {
    const [term] = await tx
      .select({ id: academicTerms.id })
      .from(academicTerms)
      .where(eq(academicTerms.isActive, true))
      .limit(1);
    if (!term) return 0;
    const [row] = await tx
      .select({ credits: sql<number>`coalesce(sum(${courses.localCredit}), 0)::int` })
      .from(grades)
      .innerJoin(sections, eq(grades.sectionId, sections.id))
      .innerJoin(courses, eq(sections.courseId, courses.id))
      .where(and(eq(grades.studentId, studentId), eq(grades.termId, term.id)));
    return row?.credits ?? 0;
  }

  private classYear(enrolledAt: Date): number {
    const now = new Date();
    const years = Math.floor((now.getTime() - enrolledAt.getTime()) / (365.25 * 24 * 3600 * 1000));
    return Math.min(Math.max(years + 1, 1), 8);
  }

  private async outstandingDebt(tx: Tx, studentId: string): Promise<number> {
    const [row] = await tx
      .select({
        debt: sql<number>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount}), 0)::bigint`,
      })
      .from(invoices)
      .where(and(eq(invoices.studentId, studentId), ne(invoices.status, 'paid')));
    return Number(row?.debt ?? 0);
  }

  /**
   * MEVCUT UÇ zenginleştirildi: temel öğrenci + program adı, kayıt tarihi, sınıf,
   * danışman (muadili), aktif dönem ders yükü. isStaff korunur.
   */
  async getById(id: string): Promise<StudentView> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertReadScope(tx, ctx, stu);
      const [prog] = await tx
        .select({ name: programs.name })
        .from(programs)
        .where(eq(programs.id, stu.programId))
        .limit(1);
      const advisorName = await this.advisorName(tx, id);
      const currentTermCredits = await this.currentTermCredits(tx, id);
      return {
        id: stu.id,
        studentNo: stu.studentNo,
        status: stu.status,
        programId: stu.programId,
        programName: prog?.name ?? '',
        enrolledAt: stu.enrolledAt,
        classYear: this.classYear(stu.enrolledAt),
        advisorName,
        currentTermCredits,
      };
    });
  }

  /**
   * Öğrenci kartı derinliği: GNO, tamamlanan/kalan AKTS, kayıt yılı, azami süre
   * kalanı, danışman, aktif dönem ders sayısı, son notlar.
   */
  async academicSummary(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const today = new Date().toISOString().slice(0, 10);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertReadScope(tx, ctx, stu);

      const [prog] = await tx
        .select({ name: programs.name, code: programs.code, level: programs.level })
        .from(programs)
        .where(eq(programs.id, stu.programId))
        .limit(1);

      const required = await tx
        .select({ ects: courses.ects, isMandatory: curriculumCourses.isMandatory })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, stu.curriculumVersionId));
      const graded = await tx
        .select({ ects: courses.ects, letter: grades.letter })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(
          and(eq(grades.studentId, id), inArray(grades.status, ['announced', 'finalized'])),
        );

      const completedEcts = graded
        .filter((r) => r.letter !== null && !FAIL_LETTERS.has(r.letter))
        .reduce((s, r) => s + r.ects, 0);
      const totalMandatoryEcts = required.reduce((s, r) => (r.isMandatory ? s + r.ects : s), 0);
      const remainingEcts = Math.max(totalMandatoryEcts - completedEcts, 0);

      const recentGrades = await tx
        .select({
          courseCode: courses.code,
          courseName: courses.nameTr,
          letter: grades.letter,
          rawScore: grades.rawScore,
          status: grades.status,
          termName: academicTerms.name,
          year: academicTerms.year,
        })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .innerJoin(academicTerms, eq(grades.termId, academicTerms.id))
        .where(eq(grades.studentId, id))
        .orderBy(desc(academicTerms.year))
        .limit(10);

      const gpaResult = await this.gpa.computeStudentGpa(id, stu.programId, today).catch(() => null);
      const advisorName = await this.advisorName(tx, id);
      const activeCourseCount = await this.activeCourseCount(tx, id);

      const maxYears = MAX_YEARS_BY_LEVEL[prog?.level ?? 'lisans'] ?? 7;
      const elapsed =
        (Date.now() - stu.enrolledAt.getTime()) / (365.25 * 24 * 3600 * 1000);
      const maxDurationLeft = Math.max(Math.round((maxYears - elapsed) * 10) / 10, 0);

      return {
        id: stu.id,
        studentNo: stu.studentNo,
        status: stu.status,
        program: { id: stu.programId, name: prog?.name ?? '', code: prog?.code ?? '' },
        gpa: gpaResult?.gpa ?? null,
        completedEcts,
        remainingEcts,
        advisorName,
        enrolledAt: stu.enrolledAt,
        classYear: this.classYear(stu.enrolledAt),
        maxDurationLeft,
        activeCourseCount,
        recentGrades,
      };
    });
  }

  /** Öğrenci 360 kartı: profil + program/müfredat + akademik + mali özet. */
  async overview(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const today = new Date().toISOString().slice(0, 10);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertReadScope(tx, ctx, stu);

      const [row] = await tx
        .select({
          email: users.email,
          programName: programs.name,
          programCode: programs.code,
          curriculumName: curriculumVersions.name,
          curriculumYear: curriculumVersions.year,
        })
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(programs, eq(students.programId, programs.id))
        .innerJoin(curriculumVersions, eq(students.curriculumVersionId, curriculumVersions.id))
        .where(eq(students.id, id))
        .limit(1);

      const required = await tx
        .select({ code: courses.code, ects: courses.ects, isMandatory: curriculumCourses.isMandatory })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, stu.curriculumVersionId));
      const graded = await tx
        .select({ code: courses.code, ects: courses.ects, letter: grades.letter, status: grades.status })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(grades.studentId, id));

      const passed = graded.filter(
        (r) =>
          ['announced', 'finalized'].includes(r.status) &&
          r.letter !== null &&
          !FAIL_LETTERS.has(r.letter),
      );
      const passedCodes = new Set(passed.map((r) => r.code));
      const earnedEcts = passed.reduce((s, r) => s + r.ects, 0);
      const activeEcts = graded
        .filter((r) => r.status === 'draft')
        .reduce((s, r) => s + r.ects, 0);
      const remainingMandatory = required.filter(
        (r) => r.isMandatory && !passedCodes.has(r.code),
      ).length;

      const gpaResult = await this.gpa.computeStudentGpa(id, stu.programId, today).catch(() => null);
      const advisorName = await this.advisorName(tx, id);
      const outstandingDebt = await this.outstandingDebt(tx, id);

      return {
        id: stu.id,
        studentNo: stu.studentNo,
        fullName: row?.email ?? '',
        email: row?.email ?? '',
        status: stu.status,
        program: { id: stu.programId, name: row?.programName ?? '', code: row?.programCode ?? '' },
        curriculumVersion: row ? `${row.curriculumName} (${row.curriculumYear})` : null,
        advisorName,
        enrolledAt: stu.enrolledAt,
        gpa: gpaResult?.gpa ?? null,
        earnedEcts,
        activeEcts,
        remainingMandatory,
        outstandingDebt,
      };
    });
  }

  /** Personel için öğrenci-bazlı not dökümü (transkript özeti) + GNO. */
  async studentGrades(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const today = new Date().toISOString().slice(0, 10);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertReadScope(tx, ctx, stu);

      const items = await tx
        .select({
          courseCode: courses.code,
          courseName: courses.nameTr,
          letter: grades.letter,
          rawScore: grades.rawScore,
          status: grades.status,
          termName: academicTerms.name,
          year: academicTerms.year,
        })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .innerJoin(academicTerms, eq(grades.termId, academicTerms.id))
        .where(eq(grades.studentId, id))
        .orderBy(desc(academicTerms.year));

      const gpaResult = await this.gpa.computeStudentGpa(id, stu.programId, today).catch(() => null);
      return { items, gpa: gpaResult?.gpa ?? null };
    });
  }

  /** Öğrenciye ait durum/işlem zaman-çizelgesi (audit_log, tek-öğrenci filtreli). */
  async timeline(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertReadScope(tx, ctx, stu);

      const rows = await tx
        .select({
          at: auditLog.at,
          action: auditLog.action,
          actorUserId: auditLog.actorUserId,
          actorEmail: users.email,
          diff: auditLog.diff,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.actorUserId, users.id))
        .where(and(eq(auditLog.resourceType, 'student'), eq(auditLog.resourceId, id)))
        .orderBy(desc(auditLog.at))
        .limit(100);

      // Hassas alan sızdırmama: yalnızca durum geçişi + karar gerekçesi/diploma no
      // gibi güvenli alanlar dışa verilir; ham diff olduğu gibi geçilmez.
      const items = rows.map((r) => {
        const d = r.diff ?? {};
        const safeDiff: Record<string, unknown> = {};
        if (d.status) safeDiff.status = d.status;
        if (d.reason) safeDiff.reason = d.reason;
        if (d.diplomaNo) safeDiff.diplomaNo = d.diplomaNo;
        return {
          at: r.at,
          action: r.action,
          actorName: r.actorEmail ?? r.actorUserId ?? 'sistem',
          diff: safeDiff,
        };
      });
      return { items };
    });
  }

  private async activeCourseCount(tx: Tx, studentId: string): Promise<number> {
    const [term] = await tx
      .select({ id: academicTerms.id })
      .from(academicTerms)
      .where(eq(academicTerms.isActive, true))
      .limit(1);
    if (!term) return 0;
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(grades)
      .where(and(eq(grades.studentId, studentId), eq(grades.termId, term.id)));
    return row?.n ?? 0;
  }

  /**
   * Öğrenci durumunu geçişle değiştirir. Geçersiz geçiş -> 409; yetkisiz -> 403.
   * Yükleme + yetki + geçiş + güncelleme + audit tek transaction'da.
   */
  async changeStatus(id: string, to: StudentStatus, reason?: string): Promise<StudentView> {
    const actor = this.actor();

    return withTenant(this.handle.db, actor.tenantId, async (tx) => {
      const row = await this.loadStudent(tx, id);

      const allowed = authorize(
        actor,
        'update',
        { type: 'student', tenantId: row.tenantId, ownerUserId: row.userId },
        OBS_AUTHORIZE_CONFIG,
      );
      if (!allowed) {
        throw new ForbiddenException('Bu öğrencinin durumunu değiştirme yetkiniz yok');
      }

      let result: { status: StudentStatus; action: string };
      try {
        result = applyTransition(row.status as StudentStatus, to);
      } catch (e) {
        if (e instanceof InvalidStatusTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }

      await tx.update(students).set({ status: result.status }).where(eq(students.id, id));

      await tx.insert(auditLog).values({
        tenantId: actor.tenantId,
        actorUserId: actor.userId === 'anonim' ? null : actor.userId,
        action: `student.${result.action}`,
        resourceType: 'student',
        resourceId: id,
        diff: { status: { from: row.status, to: result.status }, reason: reason ?? null },
      });

      const [prog] = await tx
        .select({ name: programs.name })
        .from(programs)
        .where(eq(programs.id, row.programId))
        .limit(1);
      const advisorName = await this.advisorName(tx, id);
      const currentTermCredits = await this.currentTermCredits(tx, id);

      return {
        id: row.id,
        studentNo: row.studentNo,
        status: result.status,
        programId: row.programId,
        programName: prog?.name ?? '',
        enrolledAt: row.enrolledAt,
        classYear: this.classYear(row.enrolledAt),
        advisorName,
        currentTermCredits,
      };
    });
  }

  /**
   * Danışman olabilecek personel: `ogretim_elemani` veya `danisman` rollü, aktif
   * kullanıcılar. userRoles/roles üzerinden çözülür; userId + email/ad döner.
   */
  async advisorCandidates(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Danışman listesine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({
          userId: users.id,
          email: users.email,
        })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(users.isActive, true), inArray(roles.key, ['ogretim_elemani', 'danisman'])))
        .orderBy(users.email);
      const items = rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        fullName: r.email,
      }));
      return { items, total: items.length };
    });
  }

  /** Bir öğrenciye danışman atar (students.advisorUserId). İdari yetki gerekir. */
  async setAdvisor(id: string, advisorUserId: string): Promise<{ id: string; advisorUserId: string }> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Danışman atama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const stu = await this.loadStudent(tx, id);
      await this.assertAdvisorExists(tx, advisorUserId);

      await tx.update(students).set({ advisorUserId }).where(eq(students.id, id));

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student.advisor_set',
        resourceType: 'student',
        resourceId: id,
        diff: { advisorUserId: { to: advisorUserId } },
      });

      return { id: stu.id, advisorUserId };
    });
  }

  /** Toplu danışman ataması. İdari yetki gerekir; tek transaction'da atomik. */
  async bulkSetAdvisor(
    studentIds: string[],
    advisorUserId: string,
  ): Promise<{ updated: number }> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Toplu danışman atama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.assertAdvisorExists(tx, advisorUserId);

      const updated = await tx
        .update(students)
        .set({ advisorUserId })
        .where(inArray(students.id, studentIds))
        .returning({ id: students.id });

      if (updated.length > 0) {
        await tx.insert(auditLog).values({
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId ?? null,
          action: 'student.advisor_bulk_set',
          resourceType: 'student',
          resourceId: null,
          diff: { advisorUserId: { to: advisorUserId }, studentIds: updated.map((r) => r.id) },
        });
      }

      return { updated: updated.length };
    });
  }

  /**
   * Toplu sınıf/dönem atlatma. mode=class: classYear = coalesce(classYear,1)+1;
   * mode=term: currentSemester = coalesce(currentSemester,1)+1. İdari yetki gerekir.
   */
  async promote(studentIds: string[], mode: 'class' | 'term'): Promise<{ updated: number }> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Öğrenci atlatma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const set =
        mode === 'class'
          ? { classYear: sql`coalesce(${students.classYear}, 1) + 1` }
          : { currentSemester: sql`coalesce(${students.currentSemester}, 1) + 1` };

      const updated = await tx
        .update(students)
        .set(set)
        .where(inArray(students.id, studentIds))
        .returning({ id: students.id });

      if (updated.length > 0) {
        await tx.insert(auditLog).values({
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId ?? null,
          action: `student.promote_${mode}`,
          resourceType: 'student',
          resourceId: null,
          diff: { mode, studentIds: updated.map((r) => r.id) },
        });
      }

      return { updated: updated.length };
    });
  }

  /** Atanacak danışmanın tenant içinde var olduğunu doğrular (RLS zaten sınırlar). */
  private async assertAdvisorExists(tx: Tx, advisorUserId: string): Promise<void> {
    const [row] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, advisorUserId))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Danışman kullanıcı bulunamadı');
    }
  }
}
