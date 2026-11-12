import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import { paymentInstallments, paymentPlans, refundRequests } from '../db/schema-finance-quality.js';
import { auditLog, users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { FINANCE_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel yetkisi (campus/approval STAFF ile bire bir).
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

export interface CreatePlanInput {
  studentId: string;
  year: number;
  term?: string | undefined;
  /** Kuruş (integer). */
  totalAmount: number;
  installmentCount: number;
  firstDueOn?: string | undefined;
}

export interface PayInput {
  /** Kuruş (integer). */
  amount: number;
  method: 'havale' | 'kart' | 'nakit';
  paidOn?: string | undefined;
}

export interface CreateRefundInput {
  /** Kuruş (integer). */
  amount: number;
  iban: string;
  accountHolder: string;
  bank: string;
  reason?: string | undefined;
}

export interface DecideRefundInput {
  status: 'onaylandi' | 'odendi' | 'reddedildi';
}

/** Bugünün ISO tarihi (date kolonları string alır). */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * ISO tarihe n ay ekler. Ayın son gününü aşan gün değeri clamp'lenir
 * (31 Ocak + 1 ay = 28/29 Şubat), aksi halde JS Date bir sonraki aya taşardı.
 */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(y!, m! - 1 + n, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d!, lastDay));
  return base.toISOString().slice(0, 10);
}

/**
 * Taksit tutarları: her taksit floor(total/count), kalan kuruş farkı SON taksite
 * eklenir. Toplam her zaman totalAmount'a tam eşittir (kuruş kaybı yok).
 */
export function splitInstallments(totalAmount: number, count: number): number[] {
  const base = Math.floor(totalAmount / count);
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1] = totalAmount - base * (count - 1);
  return amounts;
}

/**
 * Cari/ödeme planı servisi (0024). Tenant-kapsamlı (RLS). Plan ve taksit
 * yönetimi personelde; öğrenci kendi planını/iade taleplerini görür ve iade
 * talebi açar. Tüm para alanları KURUŞ (integer).
 */
@Injectable()
export class BillingService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Ödeme planları (personel; ?studentId): öğrenci adı + taksit/ödeme özeti. */
  async listPlans(studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Ödeme planlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await this.planRows(
        tx,
        studentId ? eq(paymentPlans.studentId, studentId) : undefined,
      );
      return { items };
    });
  }

  /** Aktör öğrencinin ödeme planları (özet ile). */
  async myPlans(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return { items: [] };
      const items = await this.planRows(tx, eq(paymentPlans.studentId, sid));
      return { items };
    });
  }

  /**
   * Plan oluştur (yalnız mali işler) VE taksitleri otomatik üret. Taksit tutarı
   * floor(total/count), fark son taksitte; dueOn firstDueOn'dan itibaren aylık
   * artar (firstDueOn yoksa null).
   */
  async createPlan(input: CreatePlanInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, FINANCE_ADMIN)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustStudent(tx, input.studentId);

      const [plan] = await tx
        .insert(paymentPlans)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          year: input.year,
          term: input.term ?? null,
          totalAmount: input.totalAmount,
          installmentCount: input.installmentCount,
        })
        .returning();

      const amounts = splitInstallments(input.totalAmount, input.installmentCount);
      const rows = await tx
        .insert(paymentInstallments)
        .values(
          amounts.map((amount, i) => ({
            tenantId: ctx.tenantId,
            planId: plan!.id,
            seq: i + 1,
            dueOn: input.firstDueOn ? addMonths(input.firstDueOn, i) : null,
            amount,
          })),
        )
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'billing.plan.create',
        resourceType: 'payment_plan',
        resourceId: plan!.id,
        diff: {
          studentId: input.studentId,
          totalAmount: input.totalAmount,
          installmentCount: input.installmentCount,
        },
      });

      return { plan: plan!, installments: rows };
    });
  }

  /** Planın sıralı taksitleri (personel tümü; öğrenci yalnızca kendi planı). */
  async installments(planId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [plan] = await tx
        .select()
        .from(paymentPlans)
        .where(eq(paymentPlans.id, planId))
        .limit(1);
      if (!plan) {
        throw new NotFoundException('Ödeme planı bulunamadı');
      }
      if (!isStaff(ctx.roles ?? [])) {
        const sid = await this.myStudentId(tx, ctx.actorUserId);
        if (!sid || sid !== plan.studentId) {
          throw new ForbiddenException('Bu ödeme planına erişim yetkiniz yok');
        }
      }
      const items = await tx
        .select()
        .from(paymentInstallments)
        .where(eq(paymentInstallments.planId, planId))
        .orderBy(asc(paymentInstallments.seq));
      return { plan, items };
    });
  }

  /**
   * Taksit tahsilatı (yalnız mali işler). paidAmount toplanır; taksit tutarı aşılırsa 409.
   * Durum: tam ödendiyse "odendi", kısmi ödemede "kismi". Planın tüm taksitleri
   * ödendiyse plan "tamamlandi" olur.
   */
  async pay(installmentId: string, input: PayInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, FINANCE_ADMIN)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [inst] = await tx
        .select()
        .from(paymentInstallments)
        .where(eq(paymentInstallments.id, installmentId))
        .limit(1);
      if (!inst) {
        throw new NotFoundException('Taksit bulunamadı');
      }

      const paidAmount = inst.paidAmount + input.amount;
      if (paidAmount > inst.amount) {
        throw new ConflictException('Taksit tutarından fazla ödeme');
      }

      const [row] = await tx
        .update(paymentInstallments)
        .set({
          paidAmount,
          status: paidAmount >= inst.amount ? 'odendi' : paidAmount > 0 ? 'kismi' : 'bekliyor',
          paidOn: input.paidOn ?? today(),
          method: input.method,
        })
        .where(eq(paymentInstallments.id, installmentId))
        .returning();

      // Plan kapanışı: ödenmemiş taksit kalmadıysa plan tamamlandı.
      const [rest] = await tx
        .select({ open: sql<number>`count(*)::int` })
        .from(paymentInstallments)
        .where(
          and(
            eq(paymentInstallments.planId, inst.planId),
            ne(paymentInstallments.status, 'odendi'),
          ),
        );
      let [plan] = await tx
        .select()
        .from(paymentPlans)
        .where(eq(paymentPlans.id, inst.planId))
        .limit(1);
      if ((rest?.open ?? 0) === 0 && plan && plan.status !== 'tamamlandi') {
        const [updated] = await tx
          .update(paymentPlans)
          .set({ status: 'tamamlandi' })
          .where(eq(paymentPlans.id, inst.planId))
          .returning();
        plan = updated!;
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'billing.installment.pay',
        resourceType: 'payment_installment',
        resourceId: installmentId,
        diff: { amount: input.amount, method: input.method, paidAmount, status: row!.status },
      });

      return { installment: row!, plan: plan ?? null };
    });
  }

  /** İade talepleri (personel; ?status): öğrenci adı/no join. */
  async listRefunds(status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('İade taleplerine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: refundRequests.id,
          studentId: refundRequests.studentId,
          studentNo: students.studentNo,
          studentName: users.email,
          amount: refundRequests.amount,
          iban: refundRequests.iban,
          accountHolder: refundRequests.accountHolder,
          bank: refundRequests.bank,
          reason: refundRequests.reason,
          status: refundRequests.status,
          decidedByUserId: refundRequests.decidedByUserId,
          createdAt: refundRequests.createdAt,
          paidAt: refundRequests.paidAt,
        })
        .from(refundRequests)
        .innerJoin(students, eq(refundRequests.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(status ? eq(refundRequests.status, status) : undefined)
        .orderBy(desc(refundRequests.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin iade talepleri. */
  async myRefunds(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return { items: [] };
      const items = await tx
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.studentId, sid))
        .orderBy(desc(refundRequests.createdAt));
      return { items };
    });
  }

  /** İade talebi aç (aktör öğrenci). */
  async createRefund(input: CreateRefundInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('İade talebini yalnızca öğrenci açabilir');
      }
      const [row] = await tx
        .insert(refundRequests)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          amount: input.amount,
          iban: input.iban,
          accountHolder: input.accountHolder,
          bank: input.bank,
          reason: input.reason ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'billing.refund.create',
        resourceType: 'refund_request',
        resourceId: row!.id,
        diff: { studentId: sid, amount: input.amount },
      });

      return row!;
    });
  }

  /**
   * İade kararı (yalnız mali işler). "odendi" yalnızca "onaylandi" durumundan verilebilir
   * (aksi halde 409); ödendiğinde paidAt damgalanır.
   */
  async decideRefund(id: string, input: DecideRefundInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, FINANCE_ADMIN)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(refundRequests)
        .where(eq(refundRequests.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('İade talebi bulunamadı');
      }
      if (input.status === 'odendi' && existing.status !== 'onaylandi') {
        throw new ConflictException('Önce onaylanmalı');
      }

      const [row] = await tx
        .update(refundRequests)
        .set({
          status: input.status,
          decidedByUserId: ctx.actorUserId ?? null,
          ...(input.status === 'odendi' ? { paidAt: new Date() } : {}),
        })
        .where(eq(refundRequests.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'billing.refund.decide',
        resourceType: 'refund_request',
        resourceId: id,
        diff: { from: existing.status, to: input.status },
      });

      return row!;
    });
  }

  /** Plan listesi + öğrenci adı ve taksit/ödeme özeti (ortak sorgu). */
  private async planRows(
    tx: Tx,
    where: ReturnType<typeof eq> | undefined,
  ): Promise<Record<string, unknown>[]> {
    return tx
      .select({
        id: paymentPlans.id,
        studentId: paymentPlans.studentId,
        studentNo: students.studentNo,
        studentName: users.email,
        year: paymentPlans.year,
        term: paymentPlans.term,
        totalAmount: paymentPlans.totalAmount,
        installmentCount: paymentPlans.installmentCount,
        status: paymentPlans.status,
        createdAt: paymentPlans.createdAt,
        installmentTotal: sql<number>`count(${paymentInstallments.id})::int`,
        paidCount: sql<number>`count(*) filter (where ${paymentInstallments.status} = 'odendi')::int`,
        paidAmount: sql<number>`coalesce(sum(${paymentInstallments.paidAmount}), 0)::int`,
        outstanding: sql<number>`(${paymentPlans.totalAmount} - coalesce(sum(${paymentInstallments.paidAmount}), 0))::int`,
      })
      .from(paymentPlans)
      .innerJoin(students, eq(paymentPlans.studentId, students.id))
      .innerJoin(users, eq(students.userId, users.id))
      .leftJoin(paymentInstallments, eq(paymentInstallments.planId, paymentPlans.id))
      .where(where)
      .groupBy(paymentPlans.id, students.studentNo, users.email)
      .orderBy(desc(paymentPlans.createdAt));
  }

  private async mustStudent(tx: Tx, studentId: string): Promise<void> {
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!s) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
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
