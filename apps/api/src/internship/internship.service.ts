import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { internshipRecords } from '../db/schema-graduate.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { INTERNSHIP_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma/yazma yetkisi (discipline.service STAFF ile bire bir).
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

export interface CreateInternshipInput {
  company: string;
  position?: string | undefined;
  startsOn?: string | undefined;
  endsOn?: string | undefined;
  days?: number | undefined;
}

export interface UpdateInternshipInput {
  status?: 'onaylandi' | 'devam' | 'tamamlandi' | 'reddedildi' | undefined;
  insuranceDone?: boolean | undefined;
  logbookSubmitted?: boolean | undefined;
  companyRating?: number | undefined;
  grade?: string | undefined;
}

/**
 * Staj servisi (0022). Tenant-kapsamlı (RLS). Öğrenci kendi staj başvurusunu
 * oluşturur/görür; personel kuyruğu görür ve kaydı ilerletir. İki iş kuralı:
 * sigorta girişi olmadan staj "devam"a geçemez, defter teslim edilmeden
 * "başarılı" notu yazılamaz.
 */
@Injectable()
export class InternshipService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktör öğrencinin staj kayıtları, en yeni önce. */
  async my(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select()
        .from(internshipRecords)
        .where(eq(internshipRecords.studentId, sid))
        .orderBy(desc(internshipRecords.createdAt));
    });
  }

  /** Aktör öğrenci staj başvurusu oluşturur (status=basvuruldu). */
  async create(input: CreateInternshipInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Staj başvurusu için öğrenci kaydınız bulunamadı');
      }
      const [row] = await tx
        .insert(internshipRecords)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          company: input.company,
          position: input.position ?? null,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          days: input.days ?? null,
          status: 'basvuruldu',
        })
        .returning();
      return row!;
    });
  }

  /** Staj kuyruğu (personel): öğrenci no/e-posta join, ?status filtresi. */
  async list(status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Staj kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (status) conds.push(eq(internshipRecords.status, status));
      const where = conds.length ? and(...conds) : undefined;
      const items = await tx
        .select({
          id: internshipRecords.id,
          studentId: internshipRecords.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          company: internshipRecords.company,
          position: internshipRecords.position,
          startsOn: internshipRecords.startsOn,
          endsOn: internshipRecords.endsOn,
          days: internshipRecords.days,
          insuranceDone: internshipRecords.insuranceDone,
          logbookSubmitted: internshipRecords.logbookSubmitted,
          companyRating: internshipRecords.companyRating,
          grade: internshipRecords.grade,
          status: internshipRecords.status,
          createdAt: internshipRecords.createdAt,
        })
        .from(internshipRecords)
        .innerJoin(students, eq(internshipRecords.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(internshipRecords.createdAt));
      return { items };
    });
  }

  /**
   * Staj güncelle (staj yetkilileri: ÖİDB/bölüm/dekanlık/öğretim elemanı).
   * Kurallar aynı istekteki alanlarla birlikte değerlendirilir (sigorta/defter
   * bu patch'te açılıyorsa geçerli sayılır).
   */
  async update(id: string, input: UpdateInternshipInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, INTERNSHIP_ADMIN)) {
      throw new ForbiddenException('Staj güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(internshipRecords)
        .where(eq(internshipRecords.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Staj kaydı bulunamadı');
      }

      const insuranceDone = input.insuranceDone ?? existing.insuranceDone;
      const logbookSubmitted = input.logbookSubmitted ?? existing.logbookSubmitted;

      if (input.status === 'devam' && !insuranceDone) {
        throw new ConflictException('Sigorta girişi yapılmadan staj başlayamaz');
      }
      if (input.grade === 'basarili' && !logbookSubmitted) {
        throw new ConflictException('Staj defteri teslim edilmeden başarılı notu verilemez');
      }

      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.insuranceDone !== undefined) patch.insuranceDone = input.insuranceDone;
      if (input.logbookSubmitted !== undefined) patch.logbookSubmitted = input.logbookSubmitted;
      if (input.companyRating !== undefined) patch.companyRating = input.companyRating;
      if (input.grade !== undefined) patch.grade = input.grade;

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(internshipRecords)
        .set(patch)
        .where(eq(internshipRecords.id, id))
        .returning();
      return row!;
    });
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
