import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConditionNode } from '@obs/academic-core';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import {
  academicTerms,
  calendarEvents,
  courses,
  curriculumCourses,
  curriculumVersions,
  programs,
} from '../db/schema-academic.js';
import {
  courseOutcomes,
  outcomeRelations,
  programOutcomes,
} from '../db/schema-curriculum.js';
import { auditLog } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ACADEMIC_ADMIN, hasRole } from '../common/roles.js';

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

// Hassas idari uçlar için DAR yetki seti (portal deseni).
const ADMIN = ['oidb', 'sistem_yoneticisi', 'rektorluk'];
const isAdmin = (roles: readonly string[] = []): boolean => roles.some((r) => ADMIN.includes(r));
/**
 * Müfredat/ders kataloğu/PÇ/matris yazımı = ACADEMIC_ADMIN.
 * Bölüm başkanı ve dekanlık da dahildir: ders/müfredat önerisi pratikte bölüm
 * kurulundan çıkar, fakülte onaylar. (Önceden yalnız yönetici+koordinatördü;
 * bölüm başkanı kendi bölümünün dersini kataloğa ekleyemiyordu.)
 */
const canEditCurriculum = (roles: readonly string[] = []): boolean =>
  hasRole(roles, ACADEMIC_ADMIN);

export interface ProgramView {
  id: string;
  code: string;
  name: string;
  level: string;
}

export interface CurriculumCourseView {
  courseCode: string;
  courseName: string;
  ects: number;
  semesterNo: number;
  isMandatory: boolean;
}

export interface CourseCatalogView {
  id: string;
  code: string;
  nameTr: string;
  ects: number;
  localCredit: number;
}

export interface CurriculumVersionSummary {
  id: string;
  versionId: string;
  year: number;
  name: string;
  isActive: boolean;
  courseCount: number;
  totalEcts: number;
}

export interface ProgramOutcomeView {
  id: string;
  code: string;
  textTr: string;
  textEn: string | null;
  tyycDimension: string | null;
}

export interface CourseOutcomeView {
  id: string;
  code: string;
  textTr: string;
  textEn: string | null;
}

export interface MatrixView {
  outcomes: { id: string; code: string }[];
  rows: {
    courseCode: string;
    courseName: string;
    cells: { outcomeId: string; level: number }[];
  }[];
}

export interface TermView {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

/**
 * Müfredat/Bologna okuma+yazma servisi. Program çıktıları (PÇ), ders öğrenme
 * çıktıları (DÇ), PÇ-DÇ ilişki matrisi ve akreditasyon dökümü. Ayrıca dönem
 * yönetimi (curriculum ownerModule'e atanan takvim uçları). Yetki portal
 * deseniyle: okuma isStaff, hassas yazma requireAdmin/koordinator.
 */
@Injectable()
export class CurriculumService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

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

  private requireCurriculumEditor(roleList: readonly string[] = []): void {
    if (!canEditCurriculum(roleList)) {
      throw new ForbiddenException('Müfredat düzenleme yetkiniz yok (yönetici veya koordinatör)');
    }
  }

  // === Mevcut okuma uçları (korunuyor) ===

  async listPrograms(): Promise<ProgramView[]> {
    const { tenantId } = requireTenant();
    const rows = await withTenant(this.handle.db, tenantId, (tx) => tx.select().from(programs));
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, level: r.level }));
  }

  async getCurriculumCourses(versionId: string): Promise<CurriculumCourseView[]> {
    const { tenantId } = requireTenant();
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .select({
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          semesterNo: curriculumCourses.semesterNo,
          isMandatory: curriculumCourses.isMandatory,
        })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, versionId)),
    );
    return rows;
  }

  /** Kiracı ders kataloğu — ders ekleme picker'ı için (kod bazında sıralı). */
  async listCourseCatalog(): Promise<CourseCatalogView[]> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: courses.id,
          code: courses.code,
          nameTr: courses.nameTr,
          ects: courses.ects,
          localCredit: courses.localCredit,
        })
        .from(courses)
        .orderBy(asc(courses.code));
      return rows;
    });
  }

  /** Kiracıya yeni ders (katalog) ekle. Aynı code varsa 409. */
  async createCourse(dto: {
    code: string;
    nameTr: string;
    nameEn?: string | null | undefined;
    ects: number;
    localCredit: number;
    theoryHours?: number | undefined;
    practiceHours?: number | undefined;
    labHours?: number | undefined;
  }): Promise<{ id: string }> {
    const ctx = requireTenant();
    this.requireCurriculumEditor(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.code, dto.code))
        .limit(1);
      if (existing) throw new ConflictException('Bu kod ile ders zaten var');

      const [inserted] = await tx
        .insert(courses)
        .values({
          tenantId: ctx.tenantId,
          code: dto.code,
          nameTr: dto.nameTr,
          nameEn: dto.nameEn ?? null,
          ects: dto.ects,
          localCredit: dto.localCredit,
          theoryHours: dto.theoryHours ?? 0,
          practiceHours: dto.practiceHours ?? 0,
          labHours: dto.labHours ?? 0,
        })
        .returning({ id: courses.id });
      if (!inserted) throw new Error('Ders eklenemedi');
      await this.recordTx(tx, ctx, 'course.create', 'course', inserted.id, {
        after: { code: dto.code, nameTr: dto.nameTr, ects: dto.ects },
      });
      return { id: inserted.id };
    });
  }

  /** Müfredat versiyonuna ders ekle. Aynı ders zaten varsa 409 (idempotent guard). */
  async addCurriculumCourse(
    versionId: string,
    dto: { courseId: string; semesterNo: number; isMandatory: boolean },
  ): Promise<{ id: string }> {
    const ctx = requireTenant();
    this.requireCurriculumEditor(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [version] = await tx
        .select({ id: curriculumVersions.id })
        .from(curriculumVersions)
        .where(eq(curriculumVersions.id, versionId))
        .limit(1);
      if (!version) throw new NotFoundException('Müfredat versiyonu bulunamadı');

      const [course] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, dto.courseId))
        .limit(1);
      if (!course) throw new NotFoundException('Ders bulunamadı');

      const [existing] = await tx
        .select({ id: curriculumCourses.id })
        .from(curriculumCourses)
        .where(
          and(
            eq(curriculumCourses.curriculumVersionId, versionId),
            eq(curriculumCourses.courseId, dto.courseId),
          ),
        )
        .limit(1);
      if (existing) throw new ConflictException('Ders bu müfredat versiyonunda zaten var');

      const [inserted] = await tx
        .insert(curriculumCourses)
        .values({
          tenantId: ctx.tenantId,
          curriculumVersionId: versionId,
          courseId: dto.courseId,
          semesterNo: dto.semesterNo,
          isMandatory: dto.isMandatory,
        })
        .returning({ id: curriculumCourses.id });
      if (!inserted) throw new Error('Ders eklenemedi');
      await this.recordTx(tx, ctx, 'curriculum_course.create', 'curriculum_course', inserted.id, {
        after: { versionId, courseId: dto.courseId, semesterNo: dto.semesterNo },
      });
      return { id: inserted.id };
    });
  }

  /** Müfredat dersinin ön koşul ağacını güncelle (object|null). */
  async setPrerequisite(
    curriculumCourseId: string,
    prerequisite: Record<string, unknown> | null,
  ): Promise<{ id: string }> {
    const ctx = requireTenant();
    this.requireCurriculumEditor(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: curriculumCourses.id })
        .from(curriculumCourses)
        .where(eq(curriculumCourses.id, curriculumCourseId))
        .limit(1);
      if (!existing) throw new NotFoundException('Müfredat dersi bulunamadı');

      await tx
        .update(curriculumCourses)
        .set({ prerequisite: (prerequisite as ConditionNode | null) ?? null })
        .where(eq(curriculumCourses.id, curriculumCourseId));
      await this.recordTx(
        tx,
        ctx,
        'curriculum_course.prerequisite',
        'curriculum_course',
        curriculumCourseId,
        { after: { prerequisite } },
      );
      return { id: curriculumCourseId };
    });
  }

  // === Program -> müfredat versiyonları (çıplak UUID input'unu kaldırır) ===

  async listProgramVersions(programId: string): Promise<CurriculumVersionSummary[]> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [prog] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!prog) throw new NotFoundException('Program bulunamadı');

      const versions = await tx
        .select()
        .from(curriculumVersions)
        .where(eq(curriculumVersions.programId, programId))
        .orderBy(asc(curriculumVersions.year));
      if (versions.length === 0) return [];

      const versionIds = versions.map((v) => v.id);
      const ccRows = await tx
        .select({
          versionId: curriculumCourses.curriculumVersionId,
          ects: courses.ects,
        })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(inArray(curriculumCourses.curriculumVersionId, versionIds));

      const agg = new Map<string, { count: number; ects: number }>();
      for (const r of ccRows) {
        const cur = agg.get(r.versionId) ?? { count: 0, ects: 0 };
        cur.count += 1;
        cur.ects += r.ects;
        agg.set(r.versionId, cur);
      }

      return versions.map((v) => {
        const a = agg.get(v.id) ?? { count: 0, ects: 0 };
        return {
          id: v.id,
          versionId: v.id,
          year: v.year,
          name: v.name,
          isActive: v.isActive,
          courseCount: a.count,
          totalEcts: a.ects,
        };
      });
    });
  }

  // === Program çıktıları (PÇ) ===

  async listOutcomes(programId: string): Promise<ProgramOutcomeView[]> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(programOutcomes)
        .where(eq(programOutcomes.programId, programId))
        .orderBy(asc(programOutcomes.sortNo), asc(programOutcomes.code));
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        textTr: r.textTr,
        textEn: r.textEn,
        tyycDimension: r.tyycDimension,
      }));
    });
  }

  /** PÇ ekle/güncelle/sil. id yoksa ekle; id + delete=true sil; id varsa güncelle. */
  async upsertOutcome(
    programId: string,
    dto: {
      id?: string | undefined;
      code?: string | undefined;
      textTr?: string | undefined;
      textEn?: string | null | undefined;
      tyycDimension?: string | null | undefined;
      sortNo?: number | undefined;
      delete?: boolean | undefined;
    },
  ): Promise<{ id: string }> {
    const ctx = requireTenant();
    this.requireCurriculumEditor(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [prog] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!prog) throw new NotFoundException('Program bulunamadı');

      if (dto.delete) {
        if (!dto.id) throw new NotFoundException('Silme için PÇ id gerekli');
        const [existing] = await tx
          .select()
          .from(programOutcomes)
          .where(and(eq(programOutcomes.id, dto.id), eq(programOutcomes.programId, programId)))
          .limit(1);
        if (!existing) throw new NotFoundException('Program çıktısı bulunamadı');
        await tx.delete(programOutcomes).where(eq(programOutcomes.id, dto.id));
        await this.recordTx(tx, ctx, 'program_outcome.delete', 'program_outcome', dto.id, {
          before: { code: existing.code },
        });
        return { id: dto.id };
      }

      if (dto.id) {
        const [existing] = await tx
          .select()
          .from(programOutcomes)
          .where(and(eq(programOutcomes.id, dto.id), eq(programOutcomes.programId, programId)))
          .limit(1);
        if (!existing) throw new NotFoundException('Program çıktısı bulunamadı');
        await tx
          .update(programOutcomes)
          .set({
            code: dto.code ?? existing.code,
            textTr: dto.textTr ?? existing.textTr,
            textEn: dto.textEn === undefined ? existing.textEn : dto.textEn,
            tyycDimension:
              dto.tyycDimension === undefined ? existing.tyycDimension : dto.tyycDimension,
            sortNo: dto.sortNo ?? existing.sortNo,
          })
          .where(eq(programOutcomes.id, dto.id));
        await this.recordTx(tx, ctx, 'program_outcome.update', 'program_outcome', dto.id, {
          after: { code: dto.code ?? existing.code },
        });
        return { id: dto.id };
      }

      if (!dto.code || !dto.textTr) {
        throw new NotFoundException('Yeni PÇ için code ve textTr zorunlu');
      }
      const [inserted] = await tx
        .insert(programOutcomes)
        .values({
          tenantId: ctx.tenantId,
          programId,
          code: dto.code,
          textTr: dto.textTr,
          textEn: dto.textEn ?? null,
          tyycDimension: dto.tyycDimension ?? null,
          sortNo: dto.sortNo ?? 0,
        })
        .returning({ id: programOutcomes.id });
      if (!inserted) throw new Error('Program çıktısı eklenemedi');
      await this.recordTx(tx, ctx, 'program_outcome.create', 'program_outcome', inserted.id, {
        after: { code: dto.code },
      });
      return { id: inserted.id };
    });
  }

  // === PÇ-DÇ matris ===

  async getMatrix(versionId: string): Promise<MatrixView> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [version] = await tx
        .select({ programId: curriculumVersions.programId })
        .from(curriculumVersions)
        .where(eq(curriculumVersions.id, versionId))
        .limit(1);
      if (!version) throw new NotFoundException('Müfredat versiyonu bulunamadı');

      const outcomes = await tx
        .select({ id: programOutcomes.id, code: programOutcomes.code })
        .from(programOutcomes)
        .where(eq(programOutcomes.programId, version.programId))
        .orderBy(asc(programOutcomes.sortNo), asc(programOutcomes.code));

      const courseRows = await tx
        .select({
          ccId: curriculumCourses.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          semesterNo: curriculumCourses.semesterNo,
        })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, versionId))
        .orderBy(asc(curriculumCourses.semesterNo), asc(courses.code));

      const ccIds = courseRows.map((c) => c.ccId);
      const relations =
        ccIds.length > 0
          ? await tx
              .select()
              .from(outcomeRelations)
              .where(inArray(outcomeRelations.curriculumCourseId, ccIds))
          : [];
      const relMap = new Map<string, number>();
      for (const r of relations) {
        relMap.set(`${r.curriculumCourseId}:${r.programOutcomeId}`, r.level);
      }

      const rows = courseRows.map((c) => ({
        courseCode: c.courseCode,
        courseName: c.courseName,
        cells: outcomes.map((o) => ({
          outcomeId: o.id,
          level: relMap.get(`${c.ccId}:${o.id}`) ?? 0,
        })),
      }));

      return { outcomes, rows };
    });
  }

  /** Bir ders (courseCode ile) + PÇ hücresinin ilişki düzeyini ayarla (0-3). */
  async setMatrixCell(
    versionId: string,
    dto: { courseCode: string; outcomeId: string; level: number },
  ): Promise<{ ok: true }> {
    const ctx = requireTenant();
    this.requireCurriculumEditor(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [cc] = await tx
        .select({ id: curriculumCourses.id })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(
          and(
            eq(curriculumCourses.curriculumVersionId, versionId),
            eq(courses.code, dto.courseCode),
          ),
        )
        .limit(1);
      if (!cc) throw new NotFoundException('Ders bu müfredat versiyonunda bulunamadı');

      const [outcome] = await tx
        .select({ id: programOutcomes.id })
        .from(programOutcomes)
        .where(eq(programOutcomes.id, dto.outcomeId))
        .limit(1);
      if (!outcome) throw new NotFoundException('Program çıktısı bulunamadı');

      const [existing] = await tx
        .select()
        .from(outcomeRelations)
        .where(
          and(
            eq(outcomeRelations.curriculumCourseId, cc.id),
            eq(outcomeRelations.programOutcomeId, dto.outcomeId),
          ),
        )
        .limit(1);

      if (dto.level === 0) {
        if (existing) {
          await tx.delete(outcomeRelations).where(eq(outcomeRelations.id, existing.id));
        }
      } else if (existing) {
        await tx
          .update(outcomeRelations)
          .set({ level: dto.level })
          .where(eq(outcomeRelations.id, existing.id));
      } else {
        await tx.insert(outcomeRelations).values({
          tenantId: ctx.tenantId,
          curriculumCourseId: cc.id,
          programOutcomeId: dto.outcomeId,
          level: dto.level,
        });
      }

      await this.recordTx(tx, ctx, 'outcome_relation.set', 'outcome_relation', cc.id, {
        after: { courseCode: dto.courseCode, outcomeId: dto.outcomeId, level: dto.level },
      });
      return { ok: true };
    });
  }

  // === Ders öğrenme çıktıları (DÇ) ===

  async listCourseOutcomes(versionId: string, courseId: string): Promise<CourseOutcomeView[]> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // courseId hem curriculumCourses.id hem courses.id olabilir — ikisini de çöz.
      const [cc] = await tx
        .select({ id: curriculumCourses.id })
        .from(curriculumCourses)
        .where(
          and(
            eq(curriculumCourses.curriculumVersionId, versionId),
            eq(curriculumCourses.courseId, courseId),
          ),
        )
        .limit(1);
      let ccId = cc?.id;
      if (!ccId) {
        const [direct] = await tx
          .select({ id: curriculumCourses.id })
          .from(curriculumCourses)
          .where(
            and(
              eq(curriculumCourses.curriculumVersionId, versionId),
              eq(curriculumCourses.id, courseId),
            ),
          )
          .limit(1);
        ccId = direct?.id;
      }
      if (!ccId) throw new NotFoundException('Ders bu müfredat versiyonunda bulunamadı');

      const rows = await tx
        .select()
        .from(courseOutcomes)
        .where(eq(courseOutcomes.curriculumCourseId, ccId))
        .orderBy(asc(courseOutcomes.sortNo), asc(courseOutcomes.code));
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        textTr: r.textTr,
        textEn: r.textEn,
      }));
    });
  }

  // === Akreditasyon dökümü (tek payload) ===

  async accreditationReport(
    programId: string,
    versionId: string,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [prog] = await tx
        .select()
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!prog) throw new NotFoundException('Program bulunamadı');

      const [version] = await tx
        .select()
        .from(curriculumVersions)
        .where(
          and(
            eq(curriculumVersions.id, versionId),
            eq(curriculumVersions.programId, programId),
          ),
        )
        .limit(1);
      if (!version) throw new NotFoundException('Müfredat versiyonu bu programa ait değil');

      // TYYÇ düzeyi program level'ından türetilir.
      const tyycMap: Record<string, { level: number; label: string }> = {
        onlisans: { level: 5, label: 'TYYÇ Düzey 5 (Önlisans)' },
        lisans: { level: 6, label: 'TYYÇ Düzey 6 (Lisans)' },
        yuksek_lisans: { level: 7, label: 'TYYÇ Düzey 7 (Yüksek Lisans)' },
        doktora: { level: 8, label: 'TYYÇ Düzey 8 (Doktora)' },
      };
      const tyyc = tyycMap[prog.level] ?? { level: 0, label: 'Bilinmiyor' };

      // Ders/AKTS dağılımı — yarıyıl bazında.
      const ccRows = await tx
        .select({
          ccId: curriculumCourses.id,
          courseCode: courses.code,
          courseName: courses.nameTr,
          ects: courses.ects,
          localCredit: courses.localCredit,
          semesterNo: curriculumCourses.semesterNo,
          isMandatory: curriculumCourses.isMandatory,
        })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, versionId))
        .orderBy(asc(curriculumCourses.semesterNo), asc(courses.code));

      const semesterMap = new Map<number, { courses: unknown[]; ects: number }>();
      for (const c of ccRows) {
        const s = semesterMap.get(c.semesterNo) ?? { courses: [], ects: 0 };
        s.courses.push({
          courseCode: c.courseCode,
          courseName: c.courseName,
          ects: c.ects,
          localCredit: c.localCredit,
          isMandatory: c.isMandatory,
        });
        s.ects += c.ects;
        semesterMap.set(c.semesterNo, s);
      }
      const semesters = [...semesterMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([semesterNo, v]) => ({ semesterNo, ects: v.ects, courses: v.courses }));
      const totalEcts = ccRows.reduce((sum, c) => sum + c.ects, 0);

      // PÇ listesi.
      const outcomeRows = await tx
        .select()
        .from(programOutcomes)
        .where(eq(programOutcomes.programId, programId))
        .orderBy(asc(programOutcomes.sortNo), asc(programOutcomes.code));
      const outcomes = outcomeRows.map((o) => ({
        id: o.id,
        code: o.code,
        textTr: o.textTr,
        textEn: o.textEn,
        tyycDimension: o.tyycDimension,
      }));

      // Ders DÇ'leri.
      const ccIds = ccRows.map((c) => c.ccId);
      const dcRows =
        ccIds.length > 0
          ? await tx
              .select()
              .from(courseOutcomes)
              .where(inArray(courseOutcomes.curriculumCourseId, ccIds))
          : [];
      const dcByCc = new Map<string, unknown[]>();
      for (const d of dcRows) {
        const arr = dcByCc.get(d.curriculumCourseId) ?? [];
        arr.push({ id: d.id, code: d.code, textTr: d.textTr, textEn: d.textEn });
        dcByCc.set(d.curriculumCourseId, arr);
      }
      const courseOutcomeList = ccRows.map((c) => ({
        courseCode: c.courseCode,
        courseName: c.courseName,
        outcomes: dcByCc.get(c.ccId) ?? [],
      }));

      // PÇ-DÇ matris özeti + TYYÇ kapsama (hangi PÇ en az bir derste geçiyor).
      const relations =
        ccIds.length > 0
          ? await tx
              .select()
              .from(outcomeRelations)
              .where(inArray(outcomeRelations.curriculumCourseId, ccIds))
          : [];
      const relMap = new Map<string, number>();
      const coveredOutcomes = new Set<string>();
      for (const r of relations) {
        relMap.set(`${r.curriculumCourseId}:${r.programOutcomeId}`, r.level);
        if (r.level > 0) coveredOutcomes.add(r.programOutcomeId);
      }
      const matrix = {
        outcomes: outcomes.map((o) => ({ id: o.id, code: o.code })),
        rows: ccRows.map((c) => ({
          courseCode: c.courseCode,
          courseName: c.courseName,
          cells: outcomes.map((o) => ({
            outcomeId: o.id,
            level: relMap.get(`${c.ccId}:${o.id}`) ?? 0,
          })),
        })),
      };
      const coverage = {
        totalOutcomes: outcomes.length,
        coveredOutcomes: coveredOutcomes.size,
        uncovered: outcomes.filter((o) => !coveredOutcomes.has(o.id)).map((o) => o.code),
        coverageRatio:
          outcomes.length > 0
            ? Math.round((coveredOutcomes.size / outcomes.length) * 100) / 100
            : 0,
      };

      return {
        program: {
          id: prog.id,
          code: prog.code,
          name: prog.name,
          level: prog.level,
          language: prog.language,
          versionId: version.id,
          versionName: version.name,
          catalogYear: version.year,
          totalEcts,
          courseCount: ccRows.length,
        },
        tyyc,
        semesters,
        outcomes,
        courseOutcomes: courseOutcomeList,
        matrix,
        coverage,
      };
    });
  }

  // === Dönem yönetimi (curriculum ownerModule'e atanan takvim uçları) ===

  async listTerms(): Promise<TermView[]> {
    const ctx = requireTenant();
    this.requireStaff(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(academicTerms)
        .orderBy(asc(academicTerms.year), asc(academicTerms.term));
      return rows.map((r) => ({
        id: r.id,
        year: r.year,
        term: r.term,
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        isActive: r.isActive,
      }));
    });
  }

  async upsertTermWindow(
    termId: string,
    dto: { type: string; startsAt: string; endsAt: string },
  ): Promise<{ termId: string; type: string; startsAt: string; endsAt: string }> {
    const ctx = requireTenant();
    this.requireAdmin(ctx.roles);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [term] = await tx
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.id, termId))
        .limit(1);
      if (!term) throw new NotFoundException('Dönem bulunamadı');

      const [existing] = await tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.termId, termId), eq(calendarEvents.type, dto.type)))
        .limit(1);

      if (existing) {
        await tx
          .update(calendarEvents)
          .set({ startsAt, endsAt })
          .where(eq(calendarEvents.id, existing.id));
      } else {
        await tx.insert(calendarEvents).values({
          tenantId: ctx.tenantId,
          termId,
          type: dto.type,
          startsAt,
          endsAt,
        });
      }
      await this.recordTx(tx, ctx, 'calendar_window.upsert', 'calendar_event', termId, {
        after: { type: dto.type, startsAt: dto.startsAt, endsAt: dto.endsAt },
      });
      return {
        termId,
        type: dto.type,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
    });
  }

  async activateTerm(termId: string): Promise<{ activeTermId: string }> {
    const ctx = requireTenant();
    this.requireAdmin(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [term] = await tx
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(eq(academicTerms.id, termId))
        .limit(1);
      if (!term) throw new NotFoundException('Dönem bulunamadı');

      await tx.update(academicTerms).set({ isActive: false }).where(eq(academicTerms.isActive, true));
      await tx.update(academicTerms).set({ isActive: true }).where(eq(academicTerms.id, termId));
      await this.recordTx(tx, ctx, 'academic_term.activate', 'academic_term', termId, {
        after: { activeTermId: termId },
      });
      return { activeTermId: termId };
    });
  }

  /** Audit yazımı — aktif transaction içinde (withTenant RLS kapsamında). */
  private async recordTx(
    tx: Tx,
    ctx: { tenantId: string; actorUserId?: string },
    action: string,
    resourceType: string,
    resourceId: string,
    diff: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLog).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId ?? null,
      action,
      resourceType,
      resourceId,
      diff,
    });
  }
}
