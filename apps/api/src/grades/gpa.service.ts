import { Inject, Injectable } from '@nestjs/common';
import { computeGpa, type CourseAttempt, type GpaResult } from '@obs/academic-core';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { academicTerms, courses } from '../db/schema-academic.js';
import { sections } from '../db/schema-enrollment.js';
import { grades } from '../db/schema-grades.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ParametersService } from '../parameters/parameters.service.js';

const TERM_RANK: Record<string, number> = { guz: 1, bahar: 2, yaz: 3 };

/**
 * GNO bağlama: öğrencinin ilan/kesin notlarını academic-core computeGpa'ya
 * besler. Tekrar politikası + yuvarlama DB'deki parametreden çözülür (§M4).
 * Sistemdeki TEK GNO servisi buraya dayanır.
 */
@Injectable()
export class GpaService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly params: ParametersService,
  ) {}

  async computeStudentGpa(
    studentId: string,
    programId: string,
    onDate: string,
  ): Promise<GpaResult> {
    const { tenantId } = requireTenant();
    const policy = await this.params.resolveGpaPolicy(tenantId, programId, onDate);

    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .select({
          code: courses.code,
          credit: courses.ects,
          coefficient: grades.coefficient,
          letter: grades.letter,
          year: academicTerms.year,
          term: academicTerms.term,
        })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .innerJoin(academicTerms, eq(grades.termId, academicTerms.id))
        .where(
          and(eq(grades.studentId, studentId), inArray(grades.status, ['announced', 'finalized'])),
        ),
    );

    const attempts: CourseAttempt[] = rows
      .filter((r): r is typeof r & { coefficient: number } => r.coefficient !== null)
      .map((r) => ({
        courseCode: r.code,
        credit: r.credit,
        coefficient: r.coefficient,
        // Muaf (MU) ortalamaya girmez; diğerleri girer.
        countsInGpa: r.letter !== 'MU',
        termOrder: r.year * 10 + (TERM_RANK[r.term] ?? 0),
      }));

    return computeGpa(attempts, policy);
  }
}
