import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { coopCompanies, coopPlacements } from '../db/schema-graduate.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma yetkisi (discipline.service STAFF ile bire bir).
// Yazma (firma tanımı / yerleştirme kararı) STUDENT_ADMIN ile dar tutulur.
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

export interface CreateCompanyInput {
  name: string;
  sector?: string | undefined;
  contact?: string | undefined;
  protocolNo?: string | undefined;
  scholarshipRateBps?: number | undefined;
}

export interface CreatePlacementInput {
  companyId: string;
  term?: string | undefined;
}

export interface UpdatePlacementInput {
  status: 'short_list' | 'kabul' | 'devam' | 'tamamlandi' | 'red';
  note?: string | undefined;
}

/**
 * CO-OP / kariyer servisi (0022). Tenant-kapsamlı (RLS). Firma protokolleri
 * personel tarafından yönetilir; öğrenci kendi yerleştirme başvurusunu yapar.
 */
@Injectable()
export class CoopService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** CO-OP firma listesi + firma başına yerleştirme sayısı. */
  async companies(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: coopCompanies.id,
          name: coopCompanies.name,
          sector: coopCompanies.sector,
          contact: coopCompanies.contact,
          protocolNo: coopCompanies.protocolNo,
          scholarshipRateBps: coopCompanies.scholarshipRateBps,
          active: coopCompanies.active,
          placementCount: count(coopPlacements.id),
          createdAt: coopCompanies.createdAt,
        })
        .from(coopCompanies)
        .leftJoin(coopPlacements, eq(coopPlacements.companyId, coopCompanies.id))
        .groupBy(coopCompanies.id)
        .orderBy(asc(coopCompanies.name));
      return { items };
    });
  }

  /** Yeni CO-OP firma/protokol kaydı (öğrenci işleri yetkilisi). */
  async createCompany(input: CreateCompanyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('CO-OP firma tanımlama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(coopCompanies)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          sector: input.sector ?? null,
          contact: input.contact ?? null,
          protocolNo: input.protocolNo ?? null,
          scholarshipRateBps: input.scholarshipRateBps ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Yerleştirme kuyruğu (personel; ?companyId,?status) — firma + öğrenci join. */
  async placements(companyId?: string, status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('CO-OP yerleştirmelerine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (companyId) conds.push(eq(coopPlacements.companyId, companyId));
      if (status) conds.push(eq(coopPlacements.status, status));
      const items = await tx
        .select({
          id: coopPlacements.id,
          companyId: coopPlacements.companyId,
          companyName: coopCompanies.name,
          companySector: coopCompanies.sector,
          studentId: coopPlacements.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          term: coopPlacements.term,
          status: coopPlacements.status,
          note: coopPlacements.note,
          createdAt: coopPlacements.createdAt,
        })
        .from(coopPlacements)
        .innerJoin(coopCompanies, eq(coopPlacements.companyId, coopCompanies.id))
        .innerJoin(students, eq(coopPlacements.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(coopPlacements.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin CO-OP başvuruları, en yeni önce. */
  async myPlacements(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          id: coopPlacements.id,
          companyId: coopPlacements.companyId,
          companyName: coopCompanies.name,
          companySector: coopCompanies.sector,
          term: coopPlacements.term,
          status: coopPlacements.status,
          note: coopPlacements.note,
          createdAt: coopPlacements.createdAt,
        })
        .from(coopPlacements)
        .innerJoin(coopCompanies, eq(coopPlacements.companyId, coopCompanies.id))
        .where(eq(coopPlacements.studentId, sid))
        .orderBy(desc(coopPlacements.createdAt));
    });
  }

  /** Aktör öğrenci CO-OP firmasına başvurur (status=basvuruldu). */
  async apply(input: CreatePlacementInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('CO-OP başvurusu için öğrenci kaydınız bulunamadı');
      }
      const [company] = await tx
        .select({ id: coopCompanies.id })
        .from(coopCompanies)
        .where(eq(coopCompanies.id, input.companyId))
        .limit(1);
      if (!company) {
        throw new NotFoundException('CO-OP firması bulunamadı');
      }
      const [row] = await tx
        .insert(coopPlacements)
        .values({
          tenantId: ctx.tenantId,
          companyId: input.companyId,
          studentId: sid,
          term: input.term ?? null,
          status: 'basvuruldu',
        })
        .returning();
      return row!;
    });
  }

  /** Yerleştirme durumunu güncelle (öğrenci işleri yetkilisi). */
  async updatePlacement(id: string, input: UpdatePlacementInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('CO-OP yerleştirmesi güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(coopPlacements)
        .set({ status: input.status, note: input.note ?? null })
        .where(eq(coopPlacements.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('CO-OP yerleştirmesi bulunamadı');
      }
      return row;
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
