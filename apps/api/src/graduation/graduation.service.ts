import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  applyTransition,
  checkCompletion,
  honorStanding,
  type CompletionResult,
  type StudentStatus,
} from '@obs/academic-core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { courses, curriculumCourses, programs, students } from '../db/schema-academic.js';
import { sections } from '../db/schema-enrollment.js';
import { grades } from '../db/schema-grades.js';
import { documentCounters } from '../db/schema-documents.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { CORE_ADMIN, hasRole } from '../common/roles.js';

// Geçmez notlar (basitleştirme; tam belirleme grade scale isPassing ile — sonraki faz).
const FAIL_LETTERS = new Set(['FF', 'NA', 'DZ']);

export interface GraduationStatus {
  completion: CompletionResult;
  gpa: number;
  earnedEcts: number;
  honor: string;
}

/**
 * Mezuniyet motoru (M5). academic-core checkCompletion'ı gerçek müfredat + notlara
 * bağlar: "mezuniyete ne kaldı" + mezuniyet onayı (durum makinesi + diploma no).
 */
@Injectable()
export class GraduationService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
    private readonly params: ParametersService,
  ) {}

  async checkGraduation(studentId: string, onDate: string): Promise<GraduationStatus> {
    const ctx = requireTenant();
    const tenantId = ctx.tenantId;

    const data = await withTenant(this.handle.db, tenantId, async (tx) => {
      const [stu] = await tx
        .select({
          programId: students.programId,
          curriculumVersionId: students.curriculumVersionId,
          userId: students.userId,
        })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      // IDOR koruması: ÖİDB/sistem yöneticisi/danışman hariç, yalnızca öğrencinin kendisi.
      const roles = new Set(ctx.roles ?? []);
      if (
        !roles.has('oidb') &&
        !roles.has('sistem_yoneticisi') &&
        !roles.has('danisman') &&
        ctx.actorUserId !== stu.userId
      ) {
        throw new ForbiddenException('Başka öğrencinin mezuniyet durumunu göremezsiniz');
      }
      const required = await tx
        .select({ code: courses.code, ects: courses.ects, isMandatory: curriculumCourses.isMandatory })
        .from(curriculumCourses)
        .innerJoin(courses, eq(curriculumCourses.courseId, courses.id))
        .where(eq(curriculumCourses.curriculumVersionId, stu.curriculumVersionId));
      const graded = await tx
        .select({ code: courses.code, ects: courses.ects, letter: grades.letter })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(
          and(eq(grades.studentId, studentId), inArray(grades.status, ['announced', 'finalized'])),
        );
      return { stu, required, graded };
    });

    const passed = data.graded.filter((r) => r.letter !== null && !FAIL_LETTERS.has(r.letter));
    const passedCourseCodes = new Set(passed.map((r) => r.code));
    const earnedEcts = passed.reduce((s, r) => s + r.ects, 0);
    const minTotalEcts = data.required.reduce((s, r) => (r.isMandatory ? s + r.ects : s), 0);

    const gpaResult = await this.gpa.computeStudentGpa(studentId, data.stu.programId, onDate);
    const rules = await this.params.resolveRuleSet(tenantId, data.stu.programId, onDate);

    const completion = checkCompletion({
      required: data.required.map((r) => ({
        courseCode: r.code,
        ects: r.ects,
        isMandatory: r.isMandatory,
      })),
      passedCourseCodes,
      earnedEcts,
      gpa: gpaResult.gpa,
      minGraduationGpa: rules.minGraduationGpa,
      minTotalEcts,
    });

    return {
      completion,
      gpa: gpaResult.gpa,
      earnedEcts,
      honor: honorStanding(gpaResult.gpa, { highHonor: 3.5, honor: 3.0 }),
    };
  }

  /** Mezuniyet onayı: koşullar sağlanırsa aktif->mezun + diploma no + audit. */
  async approveGraduation(
    studentId: string,
    onDate: string,
  ): Promise<{ diplomaNo: string; status: StudentStatus }> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, CORE_ADMIN)) {
      throw new ForbiddenException('Mezuniyet onayı yalnızca ÖİDB/sistem yöneticisi');
    }

    const status = await this.checkGraduation(studentId, onDate);
    if (!status.completion.isComplete) {
      throw new ConflictException(
        `Mezuniyet koşulları sağlanmıyor (eksik zorunlu: ${status.completion.missingMandatory.length}, GNO ${status.gpa})`,
      );
    }

    const year = Number(onDate.slice(0, 4));

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ status: students.status, programCode: programs.code })
        .from(students)
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }

      // Durum geçişi: serbest değil, makine ile (aktif -> mezun).
      const transition = applyTransition(stu.status as StudentStatus, 'mezun');

      // Atomik diploma no serisi.
      const key = `diploma:${stu.programCode}`;
      await tx
        .insert(documentCounters)
        .values({ tenantId: ctx.tenantId, key, nextValue: '1' })
        .onConflictDoNothing();
      const [counter] = await tx
        .update(documentCounters)
        .set({ nextValue: sql`(${documentCounters.nextValue}::int + 1)::text` })
        .where(and(eq(documentCounters.tenantId, ctx.tenantId), eq(documentCounters.key, key)))
        .returning({ nextValue: documentCounters.nextValue });
      const seq = Number(counter!.nextValue) - 1;
      const diplomaNo = `${stu.programCode}-${year}-${String(seq).padStart(5, '0')}`;

      await tx.update(students).set({ status: 'mezun' }).where(eq(students.id, studentId));

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: `student.${transition.action}`,
        resourceType: 'student',
        resourceId: studentId,
        diff: { status: { from: stu.status, to: 'mezun' }, diplomaNo, gpa: status.gpa },
      });

      return { diplomaNo, status: 'mezun' };
    });
  }
}
