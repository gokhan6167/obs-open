import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { exchangeMobility } from '../db/schema-services.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma yetkisi (students.service STAFF ile bire bir).
// Yazma (başvuru kararı) STUDENT_ADMIN ile dar tutulur.
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

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

export interface CreateExchangeInput {
  program: string;
  direction: string;
  partnerUniversity?: string | undefined;
  term?: string | undefined;
}

/**
 * Değişim (Erasmus/Farabi/Mevlana) hareketlilik servisi (0019). Tenant-kapsamlı
 * (RLS). Personel tüm başvuruları görür/karar verir; öğrenci kendi başvurusunu
 * oluşturur ve kendi kayıtlarını görür.
 */
@Injectable()
export class ExchangeService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Tüm hareketlilik başvuruları (personel); öğrenci ad/no join. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Değişim başvurularına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: exchangeMobility.id,
          studentId: exchangeMobility.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          program: exchangeMobility.program,
          direction: exchangeMobility.direction,
          partnerUniversity: exchangeMobility.partnerUniversity,
          term: exchangeMobility.term,
          status: exchangeMobility.status,
          createdAt: exchangeMobility.createdAt,
        })
        .from(exchangeMobility)
        .innerJoin(students, eq(exchangeMobility.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(exchangeMobility.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin kendi hareketlilik başvuruları. */
  async listMine(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return { items: [] };
      const items = await tx
        .select({
          id: exchangeMobility.id,
          studentId: exchangeMobility.studentId,
          program: exchangeMobility.program,
          direction: exchangeMobility.direction,
          partnerUniversity: exchangeMobility.partnerUniversity,
          term: exchangeMobility.term,
          status: exchangeMobility.status,
          createdAt: exchangeMobility.createdAt,
        })
        .from(exchangeMobility)
        .where(eq(exchangeMobility.studentId, sid))
        .orderBy(desc(exchangeMobility.createdAt));
      return { items };
    });
  }

  /** Değişim başvurusu oluştur (aktör öğrenci başvurur). */
  async create(input: CreateExchangeInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Oturum bulunamadı');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Yalnızca öğrenciler değişim başvurusu yapabilir');
      }

      const [row] = await tx
        .insert(exchangeMobility)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          program: input.program,
          direction: input.direction,
          partnerUniversity: input.partnerUniversity ?? null,
          term: input.term ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'exchange.create',
        resourceType: 'exchange_mobility',
        resourceId: row!.id,
        diff: {
          program: input.program,
          direction: input.direction,
        },
      });

      return row!;
    });
  }

  /** Başvuru durumunu güncelle (öğrenci işleri yetkilisi: kabul/tamamlandi/iptal) + audit. */
  async updateStatus(id: string, status: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Değişim başvurusu karar yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(exchangeMobility)
        .set({ status })
        .where(eq(exchangeMobility.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Değişim başvurusu bulunamadı');
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'exchange.updateStatus',
        resourceType: 'exchange_mobility',
        resourceId: row.id,
        diff: { status },
      });

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
