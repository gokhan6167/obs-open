import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { ACADEMIC_ADMIN, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { academicWeeks } from '../db/schema-missing.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (facilities STAFF ile bire bir).
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

export interface CreateAcademicWeekInput {
  year: number;
  term: string;
  weekNo: number;
  startsOn?: string | undefined;
  note?: string | undefined;
}

/**
 * Akademik hafta servisi (0018). Tenant-kapsamlı (RLS), personel yetkisi
 * in-service kontrol edilir.
 */
@Injectable()
export class AcademicWeeksService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Hafta listesi; opsiyonel year/term filtresi. */
  async list(year?: number, term?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Akademik hafta kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const filters = [];
      if (year !== undefined) filters.push(eq(academicWeeks.year, year));
      if (term !== undefined) filters.push(eq(academicWeeks.term, term));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const items = await tx
        .select({
          id: academicWeeks.id,
          year: academicWeeks.year,
          term: academicWeeks.term,
          weekNo: academicWeeks.weekNo,
          startsOn: academicWeeks.startsOn,
          note: academicWeeks.note,
          createdAt: academicWeeks.createdAt,
        })
        .from(academicWeeks)
        .where(where)
        .orderBy(asc(academicWeeks.year), asc(academicWeeks.term), asc(academicWeeks.weekNo));
      return { items };
    });
  }

  /** Hafta oluştur (akademik yetkili). Aynı year+term+weekNo 409. */
  async create(input: CreateAcademicWeekInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Akademik hafta oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: academicWeeks.id })
        .from(academicWeeks)
        .where(
          and(
            eq(academicWeeks.year, input.year),
            eq(academicWeeks.term, input.term),
            eq(academicWeeks.weekNo, input.weekNo),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu yıl/dönem/hafta için kayıt zaten mevcut');
      }

      const [row] = await tx
        .insert(academicWeeks)
        .values({
          tenantId: ctx.tenantId,
          year: input.year,
          term: input.term,
          weekNo: input.weekNo,
          startsOn: input.startsOn ?? null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }
}
