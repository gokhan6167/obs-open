import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { academicTerms, courses, programs, students } from '../db/schema-academic.js';
import { announcements, notifications, requests } from '../db/schema-comm.js';
import { doubleMajorApplications } from '../db/schema-double-major.js';
import { enrollments, sections } from '../db/schema-enrollment.js';
import { componentScores, gradeComponents, grades, attendance } from '../db/schema-grades.js';
import { academicRuleSets, gpaPolicies, gradeScales } from '../db/schema-parameters.js';
import { courseBologna } from '../db/schema-portal.js';
import { auditLog, roles, userRoles, users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { departmentHeads } from '../db/schema-portal.js';

interface ScopedStudentRow {
  id: string;
  studentNo: string;
  email: string;
  status: string;
  programId: string;
  programName: string;
}

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

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

// Hassas idari uçlar (kullanıcı/rol, parametreler, audit) için DAR yetki seti.
// Geniş STAFF (hoca/danışman/koordinatör dahil) bu uçlara ERİŞEMEZ.
const ADMIN = ['oidb', 'sistem_yoneticisi', 'rektorluk'];
const isAdmin = (roles: readonly string[] = []): boolean => roles.some((r) => ADMIN.includes(r));

/**
 * Portal read modeli: çok-rollü demo arayüzünün ihtiyaç duyduğu okuma uçları.
 * Hepsi JWT bağlamındaki aktör + rollere göre kapsanır (yazma YOK).
 */
@Injectable()
export class PortalService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
    private readonly params: ParametersService,
  ) {}

  /** Giriş yapan kullanıcının kimliği + (öğrenciyse) profil/GNO/notları. */
  async me(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    const today = new Date().toISOString().slice(0, 10);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [u] = await tx
        .select({ email: users.email, phone: users.phone, photoUrl: users.photoUrl })
        .from(users)
        .where(eq(users.id, ctx.actorUserId!))
        .limit(1);
      const base: Record<string, unknown> = {
        userId: ctx.actorUserId,
        email: u?.email ?? null,
        phone: u?.phone ?? null,
        photoUrl: u?.photoUrl ?? null,
        roles: ctx.roles ?? [],
      };

      const [stu] = await tx
        .select({
          id: students.id,
          studentNo: students.studentNo,
          status: students.status,
          programId: students.programId,
          programName: programs.name,
          programCode: programs.code,
        })
        .from(students)
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(eq(students.userId, ctx.actorUserId!))
        .limit(1);
      if (!stu) {
        return base; // öğrenci değil (hoca/yönetim)
      }

      const gradeRows = await tx
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
        .where(eq(grades.studentId, stu.id))
        .orderBy(desc(academicTerms.year));

      const gpaResult = await this.gpa.computeStudentGpa(stu.id, stu.programId, today);
      base.student = {
        id: stu.id,
        studentNo: stu.studentNo,
        status: stu.status,
        program: { id: stu.programId, name: stu.programName, code: stu.programCode },
        gpa: gpaResult.gpa,
        grades: gradeRows,
      };
      return base;
    });
  }

  /**
   * Giriş yapan kullanıcının iletişim bilgilerini (telefon/foto) günceller.
   * Yalnızca aktörün kendi users kaydı; sağlanan alanlar yazılır (sahiplik).
   */
  async updateMyContact(input: {
    phone?: string | null | undefined;
    photoUrl?: string | null | undefined;
  }): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const patch: Partial<{ phone: string | null; photoUrl: string | null }> = {};
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;

      if (Object.keys(patch).length > 0) {
        await tx.update(users).set(patch).where(eq(users.id, ctx.actorUserId!));
      }

      const [u] = await tx
        .select({ email: users.email, phone: users.phone, photoUrl: users.photoUrl })
        .from(users)
        .where(eq(users.id, ctx.actorUserId!))
        .limit(1);
      return {
        userId: ctx.actorUserId,
        email: u?.email ?? null,
        phone: u?.phone ?? null,
        photoUrl: u?.photoUrl ?? null,
      };
    });
  }

  /** ÇAP/yandal başvuruları: personel -> tüm kuyruk; öğrenci -> kendi başvuruları. */
  async doubleMajorList(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    const staff = isStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: doubleMajorApplications.id,
          type: doubleMajorApplications.type,
          status: doubleMajorApplications.status,
          gpaSnapshot: doubleMajorApplications.gpaSnapshot,
          decisionReason: doubleMajorApplications.decisionReason,
          createdAt: doubleMajorApplications.createdAt,
          studentNo: students.studentNo,
          ownerUserId: students.userId,
          targetProgram: programs.name,
        })
        .from(doubleMajorApplications)
        .innerJoin(students, eq(doubleMajorApplications.studentId, students.id))
        .innerJoin(programs, eq(doubleMajorApplications.targetProgramId, programs.id))
        .orderBy(desc(doubleMajorApplications.createdAt));
      return staff ? rows : rows.filter((r) => r.ownerUserId === ctx.actorUserId);
    });
  }

  /** Hoca: verdiği şubeler + kayıtlı öğrenci sayısı + öğrenci listesi. */
  async teaching(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const secs = await tx
        .select({
          id: sections.id,
          code: sections.code,
          courseCode: courses.code,
          courseName: courses.nameTr,
          termName: academicTerms.name,
          quota: sections.quota,
        })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .innerJoin(academicTerms, eq(sections.termId, academicTerms.id))
        .where(eq(sections.instructorUserId, ctx.actorUserId!))
        .orderBy(desc(academicTerms.year));
      if (secs.length === 0) {
        return [];
      }
      const ids = secs.map((s) => s.id);
      const roster = await tx
        .select({
          sectionId: grades.sectionId,
          studentNo: students.studentNo,
          letter: grades.letter,
          rawScore: grades.rawScore,
          status: grades.status,
        })
        .from(grades)
        .innerJoin(students, eq(grades.studentId, students.id))
        .where(inArray(grades.sectionId, ids));
      return secs.map((s) => ({
        ...s,
        enrolled: roster.filter((r) => r.sectionId === s.id).length,
        students: roster.filter((r) => r.sectionId === s.id),
      }));
    });
  }

  /** Üniversite geneli duyurular (anasayfa). */
  async announcements(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          title: announcements.title,
          body: announcements.body,
          createdAt: announcements.createdAt,
        })
        .from(announcements)
        .where(eq(announcements.scope, 'university'))
        .orderBy(desc(announcements.createdAt)),
    );
  }

  /** Öğrencinin ders programı: onaylı kayıtları (ders + dönem). */
  async schedule(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          sectionId: sections.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          localCredit: courses.localCredit,
          theoryHours: courses.theoryHours,
          practiceHours: courses.practiceHours,
          labHours: courses.labHours,
          sectionCode: sections.code,
          termName: academicTerms.name,
          status: enrollments.status,
        })
        .from(enrollments)
        .innerJoin(sections, eq(enrollments.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .innerJoin(academicTerms, eq(enrollments.termId, academicTerms.id))
        .where(eq(enrollments.studentId, sid))
        .orderBy(desc(academicTerms.year));
    });
  }

  /** Aktif dönemde öğrencinin HENÜZ kayıtlı olmadığı şubeler (ders seçme). */
  async availableSections(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      const [term] = await tx
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.isActive, true))
        .limit(1);
      if (!term) return [];
      const mine = await tx
        .select({ sectionId: enrollments.sectionId })
        .from(enrollments)
        .where(eq(enrollments.studentId, sid));
      const taken = new Set(mine.map((m) => m.sectionId));
      const secs = await tx
        .select({
          id: sections.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          localCredit: courses.localCredit,
          theoryHours: courses.theoryHours,
          practiceHours: courses.practiceHours,
          labHours: courses.labHours,
          sectionCode: sections.code,
          quota: sections.quota,
          filled: sections.filled,
        })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(sections.termId, term.id));
      return secs.filter((s) => !taken.has(s.id));
    });
  }

  /** Talepler (dilekçe): personel -> tümü; öğrenci -> kendi. */
  async requestsList(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    const staff = isStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: requests.id,
          type: requests.type,
          status: requests.status,
          payload: requests.payload,
          decisionReason: requests.decisionReason,
          createdAt: requests.createdAt,
          studentNo: students.studentNo,
          ownerUserId: students.userId,
        })
        .from(requests)
        .innerJoin(students, eq(requests.studentId, students.id))
        .orderBy(desc(requests.createdAt));
      return staff ? rows : rows.filter((r) => r.ownerUserId === ctx.actorUserId);
    });
  }

  /**
   * Öğrenci listesi/arama (personel). Sunucu-tarafı arama (q: no/email/program),
   * durum filtresi ve sayfalama. bolum_baskani ise sorgu aktörün bölüm(ler)inin
   * programlarıyla kısıtlanır (oidb/rektorluk tümünü görür).
   */
  async studentsList(opts: {
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    const today = new Date().toISOString().slice(0, 10);
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
    const q = opts.q?.trim();
    const status = opts.status?.trim();

    const result = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const scopedProgramIds = await this.departmentScopedProgramIds(tx, ctx);
      const conds = [];
      if (scopedProgramIds !== null) {
        if (scopedProgramIds.length === 0) {
          return { rows: [] as ScopedStudentRow[], total: 0 };
        }
        conds.push(inArray(students.programId, scopedProgramIds));
      }
      if (status) {
        conds.push(eq(students.status, status));
      }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        conds.push(
          sql`(lower(${students.studentNo}) like ${like} or lower(${users.email}) like ${like} or lower(${programs.name}) like ${like})`,
        );
      }
      const where = conds.length ? and(...conds) : undefined;
      const [cnt] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(where);
      const rows = await tx
        .select({
          id: students.id,
          studentNo: students.studentNo,
          email: users.email,
          status: students.status,
          programId: students.programId,
          programName: programs.name,
        })
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(where)
        .orderBy(desc(students.enrolledAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return { rows, total: Number(cnt?.n ?? 0) };
    });

    // GPA'yı öğrenci başına paralel hesapla (sıralı döngü cross-region latency ile
    // timeout'a gidiyordu). Promise.all dizinin sırasını korur.
    const items = await Promise.all(
      result.rows.map(async (r) => {
        const g = await this.gpa.computeStudentGpa(r.id, r.programId, today).catch(() => null);
        return {
          id: r.id,
          studentNo: r.studentNo,
          fullName: r.email,
          programId: r.programId,
          programName: r.programName,
          status: r.status,
          gpa: g?.gpa ?? null,
        };
      }),
    );
    return { items, total: result.total, page };
  }

  /** Öğrencinin ders×tür bazında devamsızlık oranı + kalan hakkı (kendi kaydı). */
  async attendanceSummary(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    const today = new Date().toISOString().slice(0, 10);
    const rows = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return null;
      const [stu] = await tx
        .select({ programId: students.programId })
        .from(students)
        .where(eq(students.id, sid))
        .limit(1);
      const agg = await tx
        .select({
          sectionId: attendance.sectionId,
          kind: attendance.kind,
          courseCode: courses.code,
          courseName: courses.nameTr,
          total: sql<number>`count(*)::int`,
          absent: sql<number>`count(*) filter (where ${attendance.present} = false)::int`,
        })
        .from(attendance)
        .innerJoin(sections, eq(attendance.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(attendance.studentId, sid))
        .groupBy(attendance.sectionId, attendance.kind, courses.code, courses.nameTr);
      return { programId: stu?.programId ?? null, agg };
    });
    if (!rows) return [];

    // Devamsızlık üst sınırları parametreden (yoksa VARSAYIM %30 teori / %20 uygulama).
    let limitTheory = 30;
    let limitPractice = 20;
    if (rows.programId) {
      try {
        const rules = await this.params.resolveRuleSet(ctx.tenantId, rows.programId, today);
        limitTheory = rules.maxAbsenceTheoryPct;
        limitPractice = rules.maxAbsencePracticePct;
      } catch {
        /* parametre yoksa varsayılan eşikler */
      }
    }

    return rows.agg.map((r) => {
      const ratePct = r.total > 0 ? Math.round((r.absent / r.total) * 1000) / 10 : 0;
      const limitPct = r.kind === 'practice' ? limitPractice : limitTheory;
      return {
        sectionId: r.sectionId,
        courseCode: r.courseCode,
        courseName: r.courseName,
        kind: r.kind,
        totalSessions: r.total,
        absent: r.absent,
        ratePct,
        limitPct,
        atRisk: ratePct >= limitPct,
      };
    });
  }

  /** Öğrenciye düşen yapılandırılmış bildirimler (sahiplik: sadece aktör hedefli). */
  async notificationsList(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          kind: notifications.type,
          read: notifications.read,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(eq(notifications.userId, ctx.actorUserId!))
        .orderBy(desc(notifications.createdAt))
        .limit(100),
    );
  }

  /**
   * Dersin Bologna içeriği: öğrenme çıktıları (course_bologna) + değerlendirme
   * (gerçek grade_components) + AKTS iş yükü (courses saatleri). Öğrenci yalnızca
   * kayıtlı olduğu section'ı görebilir; personel serbest.
   */
  async courseContent(sectionId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const staff = isStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [sec] = await tx
        .select({
          courseId: sections.courseId,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          theoryHours: courses.theoryHours,
          practiceHours: courses.practiceHours,
          labHours: courses.labHours,
        })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(eq(sections.id, sectionId))
        .limit(1);
      if (!sec) {
        throw new NotFoundException('Şube bulunamadı');
      }
      if (!staff) {
        const sid = await this.myStudentId(tx, ctx.actorUserId);
        if (!sid) {
          throw new ForbiddenException('Bu içeriğe erişim yetkiniz yok');
        }
        const [enr] = await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(and(eq(enrollments.studentId, sid), eq(enrollments.sectionId, sectionId)))
          .limit(1);
        if (!enr) {
          throw new ForbiddenException('Yalnızca kayıtlı olduğunuz dersin içeriğini görebilirsiniz');
        }
      }

      const [bologna] = await tx
        .select({ learningOutcomes: courseBologna.learningOutcomes })
        .from(courseBologna)
        .where(eq(courseBologna.courseId, sec.courseId))
        .limit(1);

      const comps = await tx
        .select({ name: gradeComponents.name, weight: gradeComponents.weight })
        .from(gradeComponents)
        .where(eq(gradeComponents.sectionId, sectionId))
        .orderBy(desc(gradeComponents.weight));
      const assessment: Record<string, number> = {};
      for (const c of comps) {
        assessment[c.name] = c.weight;
      }

      // AKTS iş yükü (saat): 1 AKTS ≈ 25-30 saat; toplam = ects*25 varsayımı, temas
      // saatleri gerçek ders saatlerinden, kalanı bağımsız çalışma.
      const weeks = 14;
      const contactTheory = sec.theoryHours * weeks;
      const contactPractice = (sec.practiceHours + sec.labHours) * weeks;
      const totalWorkload = sec.ects * 25;
      const independent = Math.max(0, totalWorkload - contactTheory - contactPractice);
      const workload = [
        { activity: 'Teorik ders (yüz yüze)', hours: contactTheory },
        { activity: 'Uygulama/Laboratuvar', hours: contactPractice },
        { activity: 'Bağımsız çalışma + değerlendirme', hours: independent },
      ].filter((w) => w.hours > 0);

      return {
        courseCode: sec.courseCode,
        courseName: sec.courseName,
        ects: sec.ects,
        learningOutcomes: bologna?.learningOutcomes ?? [],
        assessment,
        workload,
      };
    });
  }

  /** Öğrencinin bir dersteki not bileşen kırılımı (sahiplik: kendi skorları). */
  async myGradeComponents(sectionId: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          componentName: gradeComponents.name,
          weight: gradeComponents.weight,
          score: componentScores.score,
        })
        .from(gradeComponents)
        .leftJoin(
          componentScores,
          and(
            eq(componentScores.componentId, gradeComponents.id),
            eq(componentScores.studentId, sid),
          ),
        )
        .where(eq(gradeComponents.sectionId, sectionId))
        .orderBy(desc(gradeComponents.weight))
        .then((rs) =>
          rs.map((r) => ({
            componentName: r.componentName,
            weight: r.weight,
            score: r.score ?? null,
            max: 100,
          })),
        );
    });
  }

  /** Bekleyen ders kayıt onay kuyruğu (submitted) — danışman/hoca/personel. */
  async pendingEnrollments(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const scoped = await this.departmentScopedProgramIds(tx, ctx);
      if (scoped !== null && scoped.length === 0) {
        return { items: [] };
      }
      const conds = [eq(enrollments.status, 'submitted')];
      if (scoped !== null) {
        conds.push(inArray(students.programId, scoped));
      }
      const items = await tx
        .select({
          enrollmentId: enrollments.id,
          studentId: students.id,
          studentNo: students.studentNo,
          fullName: users.email,
          sectionId: sections.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          submittedAt: enrollments.createdAt,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(sections, eq(enrollments.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(and(...conds))
        .orderBy(desc(enrollments.createdAt));
      // Karar destek rozetleri: bu okuma modelinde varsayılan olumlu (gerçek kontrol
      // POST /enrollment/enroll içindedir); submitted olması ön kontrolü geçtiğini gösterir.
      return {
        items: items.map((i) => ({ ...i, prereqOk: true, conflictOk: true, quotaOk: true })),
      };
    });
  }

  /** Aktif dönem şubeleri + doluluk + hoca (personel). */
  async sectionsList(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [term] = await tx
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.isActive, true))
        .limit(1);
      if (!term) return { items: [] };
      const rows = await tx
        .select({
          sectionId: sections.id,
          sectionCode: sections.code,
          courseCode: courses.code,
          courseName: courses.nameTr,
          instructorEmail: users.email,
          quota: sections.quota,
          enrolled: sections.filled,
        })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .leftJoin(users, eq(sections.instructorUserId, users.id))
        .where(eq(sections.termId, term.id))
        .orderBy(courses.code);
      return {
        items: rows.map((r) => ({
          sectionId: r.sectionId,
          courseCode: r.courseCode,
          courseName: r.courseName,
          sectionCode: r.sectionCode,
          instructorName: r.instructorEmail ?? null,
          quota: r.quota,
          enrolled: r.enrolled,
          fillRate: r.quota > 0 ? Math.round((r.enrolled / r.quota) * 100) : 0,
          isOpen: r.enrolled < r.quota,
        })),
      };
    });
  }

  /** Kullanıcı listesi + rolleri (sistem yöneticisi/personel). */
  async usersList(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireAdmin(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const us = await tx
        .select({
          userId: users.id,
          email: users.email,
          active: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(200);
      const roleRows = await tx
        .select({ userId: userRoles.userId, key: roles.key })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id));
      const byUser = new Map<string, string[]>();
      for (const r of roleRows) {
        const arr = byUser.get(r.userId) ?? [];
        arr.push(r.key);
        byUser.set(r.userId, arr);
      }
      const items = us.map((u) => ({
        userId: u.userId,
        email: u.email,
        fullName: u.email,
        roles: byUser.get(u.userId) ?? [],
        active: u.active,
        lastLoginAt: null,
      }));
      return { items, total: items.length };
    });
  }

  /** Sistem parametreleri özeti: harf ölçeği + GNO politikası + kural setleri. */
  async parametersList(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireAdmin(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const scales = await tx
        .select({
          code: gradeScales.code,
          name: gradeScales.name,
          bands: gradeScales.bands,
          effectiveFrom: gradeScales.effectiveFrom,
          isActive: gradeScales.isActive,
        })
        .from(gradeScales)
        .orderBy(desc(gradeScales.effectiveFrom));
      const policies = await tx
        .select({
          repeatPolicy: gpaPolicies.repeatPolicy,
          roundingDigits: gpaPolicies.roundingDigits,
          roundingMode: gpaPolicies.roundingMode,
          effectiveFrom: gpaPolicies.effectiveFrom,
        })
        .from(gpaPolicies)
        .orderBy(desc(gpaPolicies.effectiveFrom));
      const ruleSets = await tx
        .select({ rules: academicRuleSets.rules, effectiveFrom: academicRuleSets.effectiveFrom })
        .from(academicRuleSets)
        .orderBy(desc(academicRuleSets.effectiveFrom));
      const items: Record<string, unknown>[] = [];
      for (const s of scales) {
        items.push({
          key: `grade_scale.${s.code}`,
          label: `Harf Notu Ölçeği — ${s.name}`,
          value: s.bands,
          valueType: 'grade_bands',
          effectiveFrom: s.effectiveFrom,
          version: s.isActive ? 'aktif' : 'pasif',
        });
      }
      for (const p of policies) {
        items.push({
          key: 'gpa_policy',
          label: 'GNO Politikası',
          value: {
            repeatPolicy: p.repeatPolicy,
            roundingDigits: p.roundingDigits,
            roundingMode: p.roundingMode,
          },
          valueType: 'gpa_policy',
          effectiveFrom: p.effectiveFrom,
          version: '1',
        });
      }
      for (const r of ruleSets) {
        items.push({
          key: 'academic_rules',
          label: 'Akademik Kural Seti (AKTS/devamsızlık/mezuniyet)',
          value: r.rules,
          valueType: 'academic_rules',
          effectiveFrom: r.effectiveFrom,
          version: '1',
        });
      }
      return { items };
    });
  }

  /** Audit log özeti — son 50 kayıt (sistem yöneticisi/personel). */
  async auditList(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireAdmin(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: auditLog.id,
          at: auditLog.at,
          actorId: auditLog.actorUserId,
          action: auditLog.action,
          entity: auditLog.resourceType,
          entityId: auditLog.resourceId,
          diff: auditLog.diff,
        })
        .from(auditLog)
        .orderBy(desc(auditLog.at))
        .limit(50);
      const items = rows.map((r) => ({
        id: String(r.id),
        at: r.at,
        actorId: r.actorId,
        actorName: r.actorId,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        before: (r.diff as { before?: unknown } | null)?.before ?? null,
        after: (r.diff as { after?: unknown } | null)?.after ?? null,
      }));
      return { items, total: items.length };
    });
  }

  private requireStaff(roleList: readonly string[] = []): void {
    if (!isStaff(roleList)) {
      throw new ForbiddenException('Bu uca yalnızca personel erişebilir');
    }
  }

  private requireAdmin(roleList: readonly string[] = []): void {
    if (!isAdmin(roleList)) {
      throw new ForbiddenException('Bu uca yalnızca yönetici erişebilir');
    }
  }

  /**
   * bolum_baskani ise aktörün başkanı olduğu bölüm(ler)in programId listesini,
   * değilse (oidb/rektorluk/diğer geniş staff) null (kısıt yok) döndürür. Bölüm
   * başkanı hiç bölüme atanmamışsa boş liste (hiçbir öğrenci görünmez).
   */
  private async departmentScopedProgramIds(
    tx: Tx,
    ctx: { roles?: readonly string[]; actorUserId?: string },
  ): Promise<string[] | null> {
    const roleSet = new Set(ctx.roles ?? []);
    // Geniş erişim: bölüm başkanı DEĞİL veya üst yönetim ise kısıt uygulanmaz.
    if (roleSet.has('oidb') || roleSet.has('sistem_yoneticisi') || roleSet.has('rektorluk')) {
      return null;
    }
    if (!roleSet.has('bolum_baskani') || !ctx.actorUserId) {
      return null;
    }
    const rows = await tx
      .select({ programId: programs.id })
      .from(departmentHeads)
      .innerJoin(programs, eq(programs.departmentId, departmentHeads.departmentId))
      .where(eq(departmentHeads.userId, ctx.actorUserId));
    return rows.map((r) => r.programId);
  }

  private async myStudentId(
    tx: Tx,
    actorUserId?: string,
  ): Promise<string | null> {
    if (!actorUserId) return null;
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, actorUserId))
      .limit(1);
    return s?.id ?? null;
  }
}
