import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, count, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { ACADEMIC_ADMIN, STAFF_READ, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import {
  curriculumVersions,
  departments,
  faculties,
  programs,
  students,
} from '../db/schema-academic.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

export interface CreateFacultyInput {
  code: string;
  name: string;
}

export interface CreateDepartmentInput {
  facultyId: string;
  code: string;
  name: string;
}

export interface CreateProgramInput {
  departmentId: string;
  code: string;
  name: string;
  level: string;
  language?: string | undefined;
  educationModel?: string | undefined;
}

export interface CreateCurriculumVersionInput {
  year: number;
  name: string;
  isActive?: boolean | undefined;
}

/**
 * Akademik yapı servisi (fakülte > bölüm > program > müfredat versiyonu).
 * Tenant-kapsamlı (RLS); okuma personel geneli, yazma ACADEMIC_ADMIN.
 */
@Injectable()
export class AcademicStructureService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  private requireRead(roles: readonly string[] | undefined): void {
    if (!hasRole(roles, STAFF_READ)) {
      throw new ForbiddenException('Akademik yapı kayıtlarına erişim yetkiniz yok');
    }
  }

  private requireWrite(roles: readonly string[] | undefined): void {
    if (!hasRole(roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Akademik yapı düzenleme yetkiniz yok');
    }
  }

  /**
   * Fakülte > bölüm > program hiyerarşisi tek yanıtta. Program başına öğrenci
   * sayısı ayrı bir grup sorgusuyla alınır (N+1 yok, 4 sorgu).
   */
  async tree(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireRead(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const facultyRows = await tx
        .select({ id: faculties.id, code: faculties.code, name: faculties.name })
        .from(faculties)
        .orderBy(asc(faculties.code));
      const departmentRows = await tx
        .select({
          id: departments.id,
          facultyId: departments.facultyId,
          code: departments.code,
          name: departments.name,
        })
        .from(departments)
        .orderBy(asc(departments.code));
      const programRows = await tx
        .select({
          id: programs.id,
          departmentId: programs.departmentId,
          code: programs.code,
          name: programs.name,
          level: programs.level,
          language: programs.language,
          educationModel: programs.educationModel,
        })
        .from(programs)
        .orderBy(asc(programs.code));
      const countRows = await tx
        .select({ programId: students.programId, studentCount: count() })
        .from(students)
        .groupBy(students.programId);

      const counts = new Map(countRows.map((r) => [r.programId, Number(r.studentCount)]));
      const programsByDepartment = new Map<string, Record<string, unknown>[]>();
      for (const p of programRows) {
        const list = programsByDepartment.get(p.departmentId) ?? [];
        list.push({
          id: p.id,
          code: p.code,
          name: p.name,
          level: p.level,
          language: p.language,
          educationModel: p.educationModel,
          studentCount: counts.get(p.id) ?? 0,
        });
        programsByDepartment.set(p.departmentId, list);
      }
      const departmentsByFaculty = new Map<string, Record<string, unknown>[]>();
      for (const d of departmentRows) {
        const list = departmentsByFaculty.get(d.facultyId) ?? [];
        list.push({
          id: d.id,
          code: d.code,
          name: d.name,
          programs: programsByDepartment.get(d.id) ?? [],
        });
        departmentsByFaculty.set(d.facultyId, list);
      }

      const items = facultyRows.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        departments: departmentsByFaculty.get(f.id) ?? [],
      }));
      return { items };
    });
  }

  /** Fakülte listesi (personel). */
  async listFaculties(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireRead(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: faculties.id,
          code: faculties.code,
          name: faculties.name,
          createdAt: faculties.createdAt,
        })
        .from(faculties)
        .orderBy(asc(faculties.code));
      return { items };
    });
  }

  /** Fakülte oluştur. Aynı kod tenant içinde tekildir. */
  async createFaculty(input: CreateFacultyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireWrite(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      try {
        const [row] = await tx
          .insert(faculties)
          .values({ tenantId: ctx.tenantId, code: input.code, name: input.name })
          .returning();
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu kodla bir fakülte zaten var');
        }
        throw e;
      }
    });
  }

  /** Bölüm listesi; opsiyonel fakülte filtresi, fakülte adı join. */
  async listDepartments(facultyId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireRead(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = facultyId ? eq(departments.facultyId, facultyId) : undefined;
      const items = await tx
        .select({
          id: departments.id,
          facultyId: departments.facultyId,
          facultyCode: faculties.code,
          facultyName: faculties.name,
          code: departments.code,
          name: departments.name,
        })
        .from(departments)
        .innerJoin(faculties, eq(departments.facultyId, faculties.id))
        .where(where)
        .orderBy(asc(departments.code));
      return { items };
    });
  }

  /** Bölüm oluştur. Fakülte aynı kiracıda olmalı (RLS + varlık kontrolü). */
  async createDepartment(input: CreateDepartmentInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireWrite(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [faculty] = await tx
        .select({ id: faculties.id })
        .from(faculties)
        .where(eq(faculties.id, input.facultyId))
        .limit(1);
      if (!faculty) throw new NotFoundException('Fakülte bulunamadı');

      try {
        const [row] = await tx
          .insert(departments)
          .values({
            tenantId: ctx.tenantId,
            facultyId: input.facultyId,
            code: input.code,
            name: input.name,
          })
          .returning();
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu kodla bir bölüm zaten var');
        }
        throw e;
      }
    });
  }

  /** Program listesi; opsiyonel bölüm filtresi, bölüm + fakülte adı join. */
  async listPrograms(departmentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireRead(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = departmentId ? eq(programs.departmentId, departmentId) : undefined;
      const items = await tx
        .select({
          id: programs.id,
          departmentId: programs.departmentId,
          departmentCode: departments.code,
          departmentName: departments.name,
          facultyId: faculties.id,
          facultyName: faculties.name,
          code: programs.code,
          name: programs.name,
          level: programs.level,
          language: programs.language,
          educationModel: programs.educationModel,
        })
        .from(programs)
        .innerJoin(departments, eq(programs.departmentId, departments.id))
        .innerJoin(faculties, eq(departments.facultyId, faculties.id))
        .where(where)
        .orderBy(asc(programs.code));
      return { items };
    });
  }

  /** Program oluştur. Bölüm aynı kiracıda olmalı. */
  async createProgram(input: CreateProgramInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireWrite(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [department] = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, input.departmentId))
        .limit(1);
      if (!department) throw new NotFoundException('Bölüm bulunamadı');

      try {
        const [row] = await tx
          .insert(programs)
          .values({
            tenantId: ctx.tenantId,
            departmentId: input.departmentId,
            code: input.code,
            name: input.name,
            level: input.level,
            ...(input.language ? { language: input.language } : {}),
            ...(input.educationModel ? { educationModel: input.educationModel } : {}),
          })
          .returning();
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu kodla bir program zaten var');
        }
        throw e;
      }
    });
  }

  /** Programın müfredat versiyonları (yıla göre yeniden eskiye). */
  async listCurriculumVersions(programId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireRead(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [program] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!program) throw new NotFoundException('Program bulunamadı');

      const items = await tx
        .select({
          id: curriculumVersions.id,
          programId: curriculumVersions.programId,
          year: curriculumVersions.year,
          name: curriculumVersions.name,
          isActive: curriculumVersions.isActive,
        })
        .from(curriculumVersions)
        .where(eq(curriculumVersions.programId, programId))
        .orderBy(asc(curriculumVersions.year));
      return { items };
    });
  }

  /** Programa müfredat versiyonu ekle. (programId, year) tekildir. */
  async createCurriculumVersion(
    programId: string,
    input: CreateCurriculumVersionInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.requireWrite(ctx.roles);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [program] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!program) throw new NotFoundException('Program bulunamadı');

      try {
        const [row] = await tx
          .insert(curriculumVersions)
          .values({
            tenantId: ctx.tenantId,
            programId,
            year: input.year,
            name: input.name,
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          })
          .returning();
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu yıl için müfredat versiyonu zaten var');
        }
        throw e;
      }
    });
  }
}
