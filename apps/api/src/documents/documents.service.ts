import { randomBytes } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { courses, programs, students } from '../db/schema-academic.js';
import { sections } from '../db/schema-enrollment.js';
import { grades } from '../db/schema-grades.js';
import { documents } from '../db/schema-documents.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { PdfService } from './pdf.service.js';

export interface VerifyResult {
  valid: boolean;
  docType?: string;
  studentNo?: string;
  programName?: string;
  issuedAt?: string;
  revoked?: boolean;
}

/**
 * Belge servisi (M5). Transkript üretir (doğrulama kodu + PDF + audit) ve public
 * doğrulama sağlar. Doğrulama, tenant bilinmeden SECURITY DEFINER fonksiyonuyla
 * (RLS güvenli bypass) yapılır — yalnızca public-güvenli alanlar döner.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
    private readonly pdf: PdfService,
  ) {}

  private newCode(): string {
    return randomBytes(9).toString('base64url');
  }

  async issueTranscript(
    studentId: string,
    onDate: string,
  ): Promise<{ verificationCode: string; pdf: Buffer }> {
    const ctx = requireTenant();

    const { student, lines } = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({
          studentNo: students.studentNo,
          programId: students.programId,
          programName: programs.name,
          userId: students.userId,
        })
        .from(students)
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      // IDOR koruması: ÖİDB/sistem yöneticisi hariç, yalnızca öğrencinin kendisi.
      const roles = new Set(ctx.roles ?? []);
      if (
        !roles.has('oidb') &&
        !roles.has('sistem_yoneticisi') &&
        ctx.actorUserId !== stu.userId
      ) {
        throw new ForbiddenException('Başka öğrencinin belgesini üretemezsiniz');
      }
      const rows = await tx
        .select({
          code: courses.code,
          name: courses.nameTr,
          ects: courses.ects,
          letter: grades.letter,
        })
        .from(grades)
        .innerJoin(sections, eq(grades.sectionId, sections.id))
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .where(
          and(eq(grades.studentId, studentId), inArray(grades.status, ['announced', 'finalized'])),
        );
      return { student: stu, lines: rows };
    });

    const gpaResult = await this.gpa.computeStudentGpa(studentId, student.programId, onDate);

    const verificationCode = this.newCode();
    const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/api/v1/public/verify/${verificationCode}`;

    const pdf = await this.pdf.buildTranscriptPdf({
      universityName: 'Ogrenci Bilgi Sistemi',
      studentNo: student.studentNo,
      programName: student.programName,
      gpa: gpaResult.gpa,
      totalEcts: gpaResult.totalCredit,
      lines: lines.map((l) => ({ code: l.code, name: l.name, ects: l.ects, letter: l.letter ?? '-' })),
      verificationCode,
      verifyUrl,
    });

    await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await tx.insert(documents).values({
        tenantId: ctx.tenantId,
        type: 'transkript',
        studentId,
        verificationCode,
        payload: { gpa: gpaResult.gpa, totalEcts: gpaResult.totalCredit, lineCount: lines.length },
        issuedByUserId: ctx.actorUserId ?? null,
      });
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'document.transkript_uretildi',
        resourceType: 'document',
        resourceId: verificationCode,
        diff: { studentId },
      });
    });

    return { verificationCode, pdf };
  }

  /** PUBLIC doğrulama — tenant/kimlik gerektirmez. SECURITY DEFINER fonksiyonu. */
  async verify(code: string): Promise<VerifyResult> {
    const rows = await this.handle.db.execute(
      sql`select doc_type, student_no, program_name, issued_at, revoked from verify_document(${code})`,
    );
    const list = rows as unknown as Array<{
      doc_type: string;
      student_no: string;
      program_name: string;
      issued_at: string;
      revoked: boolean;
    }>;
    const row = list[0];
    if (!row) {
      return { valid: false };
    }
    return {
      valid: !row.revoked,
      docType: row.doc_type,
      studentNo: row.student_no,
      programName: row.program_name,
      issuedAt: String(row.issued_at),
      revoked: row.revoked,
    };
  }
}
