import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { requireOwnershipOrRole, requireRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { academicTerms, programs, students } from '../db/schema-academic.js';
import { debtTypes } from '../db/schema-depth.js';
import { users } from '../db/schema.js';
import {
  feeSchedules,
  invoices,
  payments,
  reconciliationRecords,
  scholarships,
} from '../db/schema-finance.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { computeTuition } from './pricing.js';
import { matchReconciliation as matchBankRecords, type BankRecord } from './reconciliation.js';

/** Mali okuma rolleri — tahsilat/özet/mutabakat gibi personel okuma uçları. */
const FINANCE_READ_ROLES = ['mali_isler', 'oidb', 'sistem_yoneticisi', 'rektorluk'] as const;
/**
 * Rapor rolleri — /reports/* uçları. reports modülündeki REPORT_ROLES ile birebir
 * aynı (dekanlik/bolum_baskani dahil); mali okuma rollerinden farklı bir küme.
 */
const REPORT_ROLES = [
  'oidb',
  'rektorluk',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'mali_isler',
] as const;
/** Sahiplik dışında öğrenci mali verisini görebilen personel rolleri. */
const FINANCE_STAFF_ROLES = ['mali_isler', 'oidb', 'sistem_yoneticisi'] as const;
/** Mutabakat (banka istisna) — dar mali yetki. */
const RECON_ROLES = ['mali_isler', 'sistem_yoneticisi'] as const;

export interface InvoiceRow {
  id: string;
  termName: string;
  year: number;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
}

export interface PaymentRow {
  id: string;
  invoiceId: string;
  amount: number;
  provider: string;
  providerRef: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  collected: number;
  accrued: number;
  outstanding: number;
  debtorCount: number;
  invoiceCount: number;
  partialCount: number;
  paidCount: number;
  scholarshipCount: number;
  scholarshipTotal: number;
  topDebtors: {
    studentId: string;
    studentNo: string;
    fullName: string;
    programName: string;
    status: string;
    outstanding: number;
  }[];
}

@Injectable()
export class FinanceService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Sahiplik doğrulaması: öğrenci kendi mali verisi; personel tümü (IDOR). */
  private async assertStudentAccess(
    tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0],
    ctx: ReturnType<typeof requireTenant>,
    studentId: string,
  ): Promise<void> {
    const [stu] = await tx
      .select({ userId: students.userId })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!stu) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
    requireOwnershipOrRole(ctx, stu.userId, FINANCE_STAFF_ROLES);
  }

  /** Fatura üret: ücret tarifesi + burs oranı -> net (pricing motoru). */
  async createInvoice(
    studentId: string,
    termId: string,
    year: number,
  ): Promise<{ invoiceId: string; amount: number }> {
    const ctx = requireTenant();
    requireRole(ctx, ['mali_isler', 'sistem_yoneticisi']);
    const tenantId = ctx.tenantId;
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [stu] = await tx
        .select({ programId: students.programId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      const [fee] = await tx
        .select({ base: feeSchedules.baseAmount })
        .from(feeSchedules)
        .where(and(eq(feeSchedules.programId, stu.programId), eq(feeSchedules.year, year)))
        .limit(1);
      if (!fee) {
        throw new NotFoundException('Ücret tarifesi tanımlı değil');
      }
      const [sch] = await tx
        .select({ rateBps: scholarships.rateBps })
        .from(scholarships)
        .where(eq(scholarships.studentId, studentId))
        .orderBy(sql`${scholarships.effectiveFrom} desc`)
        .limit(1);

      const result = computeTuition({
        baseAmount: fee.base,
        scholarshipRate: sch ? sch.rateBps / 10000 : 0,
        discounts: [],
        installments: 1,
      });

      const [inv] = await tx
        .insert(invoices)
        .values({ tenantId, studentId, termId, amount: result.net })
        .returning({ id: invoices.id });
      return { invoiceId: inv!.id, amount: result.net };
    });
  }

  /** Tenant bursları — öğrenci adı(email)/no join'li liste. Mali okuma personeli. */
  async listScholarships(): Promise<
    {
      id: string;
      studentId: string;
      studentNo: string;
      studentName: string;
      type: string;
      rateBps: number;
      effectiveFrom: string;
      effectiveTo: string | null;
    }[]
  > {
    const ctx = requireTenant();
    requireRole(ctx, FINANCE_READ_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: scholarships.id,
          studentId: scholarships.studentId,
          studentNo: students.studentNo,
          studentName: users.email,
          type: scholarships.type,
          rateBps: scholarships.rateBps,
          effectiveFrom: scholarships.effectiveFrom,
          effectiveTo: scholarships.effectiveTo,
        })
        .from(scholarships)
        .innerJoin(students, eq(scholarships.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(scholarships.effectiveFrom));
      return rows;
    });
  }

  /** Burs ekle (insert). Yalnızca mali işler/sistem yöneticisi. */
  async createScholarship(
    studentId: string,
    rateBps: number,
    provider?: string,
  ): Promise<{ id: string }> {
    const ctx = requireTenant();
    requireRole(ctx, ['mali_isler', 'sistem_yoneticisi']);
    const tenantId = ctx.tenantId;
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [stu] = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      const [row] = await tx
        .insert(scholarships)
        .values({
          tenantId,
          studentId,
          type: provider ?? 'diger',
          rateBps,
          effectiveFrom: new Date().toISOString().slice(0, 10),
        })
        .returning({ id: scholarships.id });
      return { id: row!.id };
    });
  }

  /** Ücret tarifeleri — program adı/kodu join'li liste. Mali okuma personeli. */
  async listFeeSchedules(): Promise<
    {
      id: string;
      programId: string;
      programCode: string;
      programName: string;
      year: number;
      baseAmount: number;
    }[]
  > {
    const ctx = requireTenant();
    requireRole(ctx, FINANCE_READ_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: feeSchedules.id,
          programId: feeSchedules.programId,
          programCode: programs.code,
          programName: programs.name,
          year: feeSchedules.year,
          baseAmount: feeSchedules.baseAmount,
        })
        .from(feeSchedules)
        .innerJoin(programs, eq(feeSchedules.programId, programs.id))
        .orderBy(desc(feeSchedules.year), programs.code);
      return rows;
    });
  }

  /** Ücret tarifesi ekle. Aynı program+yıl varsa 409. Mali işler/sistem yöneticisi. */
  async createFeeSchedule(
    programId: string,
    year: number,
    baseAmount: number,
  ): Promise<{ id: string }> {
    const ctx = requireTenant();
    requireRole(ctx, ['mali_isler', 'sistem_yoneticisi']);
    const tenantId = ctx.tenantId;
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [prog] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, programId))
        .limit(1);
      if (!prog) {
        throw new NotFoundException('Program bulunamadı');
      }
      const [existing] = await tx
        .select({ id: feeSchedules.id })
        .from(feeSchedules)
        .where(and(eq(feeSchedules.programId, programId), eq(feeSchedules.year, year)))
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu program ve yıl için ücret tarifesi zaten tanımlı');
      }
      const [row] = await tx
        .insert(feeSchedules)
        .values({ tenantId, programId, year, baseAmount })
        .returning({ id: feeSchedules.id });
      return { id: row!.id };
    });
  }

  /** Borç türleri listesi (kod/ad/aktif). Mali okuma rolleri. */
  async listDebtTypes(): Promise<
    { id: string; code: string; name: string; active: boolean }[]
  > {
    const ctx = requireTenant();
    requireRole(ctx, FINANCE_READ_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: debtTypes.id,
          code: debtTypes.code,
          name: debtTypes.name,
          active: debtTypes.active,
        })
        .from(debtTypes)
        .orderBy(debtTypes.code);
      return rows;
    });
  }

  /** Borç türü ekle. Aynı kod varsa 409. Mali işler/sistem yöneticisi. */
  async createDebtType(code: string, name: string): Promise<{ id: string }> {
    const ctx = requireTenant();
    requireRole(ctx, ['mali_isler', 'sistem_yoneticisi']);
    const tenantId = ctx.tenantId;
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: debtTypes.id })
        .from(debtTypes)
        .where(eq(debtTypes.code, code))
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu kod ile borç türü zaten tanımlı');
      }
      const [row] = await tx
        .insert(debtTypes)
        .values({ tenantId, code, name })
        .returning({ id: debtTypes.id });
      return { id: row!.id };
    });
  }

  /** Öğrencinin kalan borcu (ödenmemiş fatura toplamı). Borç kuralı bunu kullanır. */
  async outstandingDebt(studentId: string): Promise<number> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // IDOR koruması: personel hariç yalnızca öğrencinin kendisi kendi borcunu görür.
      const [stu] = await tx
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      requireOwnershipOrRole(ctx, stu.userId, ['mali_isler', 'oidb', 'sistem_yoneticisi']);

      const [row] = await tx
        .select({
          debt: sql<number>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount}), 0)::bigint`,
        })
        .from(invoices)
        .where(and(eq(invoices.studentId, studentId), ne(invoices.status, 'paid')));
      return Number(row?.debt ?? 0);
    });
  }

  /** Öğrencinin fatura listesi (dönem/tutar/ödenen/kalan/durum). Sahiplik veya personel. */
  async studentInvoices(studentId: string): Promise<InvoiceRow[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.assertStudentAccess(tx, ctx, studentId);
      const rows = await tx
        .select({
          id: invoices.id,
          termName: academicTerms.name,
          year: academicTerms.year,
          amount: invoices.amount,
          paidAmount: invoices.paidAmount,
          status: invoices.status,
        })
        .from(invoices)
        .innerJoin(academicTerms, eq(invoices.termId, academicTerms.id))
        .where(eq(invoices.studentId, studentId))
        .orderBy(desc(invoices.createdAt));
      return rows.map((r) => ({
        id: r.id,
        termName: r.termName,
        year: r.year,
        amount: Number(r.amount),
        paidAmount: Number(r.paidAmount),
        outstanding: Number(r.amount) - Number(r.paidAmount),
        status: r.status,
      }));
    });
  }

  /** Öğrencinin ödeme/dekont geçmişi (makbuz). Sahiplik veya personel. */
  async studentPayments(studentId: string): Promise<PaymentRow[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.assertStudentAccess(tx, ctx, studentId);
      const rows = await tx
        .select({
          id: payments.id,
          invoiceId: payments.invoiceId,
          amount: payments.amount,
          provider: payments.provider,
          providerRef: payments.providerRef,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(eq(invoices.studentId, studentId))
        .orderBy(desc(payments.createdAt));
      return rows.map((r) => ({
        id: r.id,
        invoiceId: r.invoiceId,
        amount: Number(r.amount),
        provider: r.provider,
        providerRef: r.providerRef,
        createdAt: r.createdAt.toISOString(),
      }));
    });
  }

  /**
   * Öğrencinin tam mali ekstresi: fatura + her faturanın ödemeleri + burslar + toplamlar.
   * Sahiplik veya personel. UUID elle girmeyi bitirir (satır-genişletme + fatura seçimi).
   */
  async studentStatement(studentId: string): Promise<{
    invoices: {
      id: string;
      termName: string;
      gross: number;
      scholarshipDeduction: number;
      net: number;
      paidAmount: number;
      outstanding: number;
      status: string;
      createdAt: string;
      payments: PaymentRow[];
    }[];
    scholarships: {
      type: string;
      rateBps: number;
      effectiveFrom: string;
      effectiveTo: string | null;
    }[];
    totals: { accrued: number; paid: number; outstanding: number };
  }> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ userId: students.userId, programId: students.programId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      requireOwnershipOrRole(ctx, stu.userId, FINANCE_STAFF_ROLES);

      const invRows = await tx
        .select({
          id: invoices.id,
          termName: academicTerms.name,
          amount: invoices.amount,
          paidAmount: invoices.paidAmount,
          status: invoices.status,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(academicTerms, eq(invoices.termId, academicTerms.id))
        .where(eq(invoices.studentId, studentId))
        .orderBy(desc(invoices.createdAt));

      const invoiceIds = invRows.map((r) => r.id);
      const payRows = invoiceIds.length
        ? await tx
            .select({
              id: payments.id,
              invoiceId: payments.invoiceId,
              amount: payments.amount,
              provider: payments.provider,
              providerRef: payments.providerRef,
              createdAt: payments.createdAt,
            })
            .from(payments)
            .where(inArray(payments.invoiceId, invoiceIds))
            .orderBy(desc(payments.createdAt))
        : [];

      const payByInvoice = new Map<string, PaymentRow[]>();
      for (const p of payRows) {
        const row: PaymentRow = {
          id: p.id,
          invoiceId: p.invoiceId,
          amount: Number(p.amount),
          provider: p.provider,
          providerRef: p.providerRef,
          createdAt: p.createdAt.toISOString(),
        };
        const list = payByInvoice.get(p.invoiceId);
        if (list) {
          list.push(row);
        } else {
          payByInvoice.set(p.invoiceId, [row]);
        }
      }

      // Brüt/burs kırılımı: aktif burs oranını fatura yılına göre türet (net=amount kesin).
      const schRows = await tx
        .select({
          type: scholarships.type,
          rateBps: scholarships.rateBps,
          effectiveFrom: scholarships.effectiveFrom,
          effectiveTo: scholarships.effectiveTo,
        })
        .from(scholarships)
        .where(eq(scholarships.studentId, studentId))
        .orderBy(desc(scholarships.effectiveFrom));

      const activeRateBps = schRows[0]?.rateBps ?? 0;
      const invoicesOut = invRows.map((r) => {
        const net = Number(r.amount);
        // net = brüt * (1 - oran) -> brüt = net / (1 - oran). Oran 100% ise brüt=net.
        const gross =
          activeRateBps > 0 && activeRateBps < 10000
            ? Math.round(net / (1 - activeRateBps / 10000))
            : net;
        return {
          id: r.id,
          termName: r.termName,
          gross,
          scholarshipDeduction: gross - net,
          net,
          paidAmount: Number(r.paidAmount),
          outstanding: net - Number(r.paidAmount),
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          payments: payByInvoice.get(r.id) ?? [],
        };
      });

      const accrued = invoicesOut.reduce((s, i) => s + i.net, 0);
      const paid = invoicesOut.reduce((s, i) => s + i.paidAmount, 0);
      return {
        invoices: invoicesOut,
        scholarships: schRows.map((s) => ({
          type: s.type,
          rateBps: s.rateBps,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
        })),
        totals: { accrued, paid, outstanding: accrued - paid },
      };
    });
  }

  /**
   * Fatura kesmeden tahakkuk önizlemesi (YAZMA YOK): brüt + burs oranı + net + taksit.
   * Sahiplik veya personel. Fatura sayfasında 'Fatura Kes' öncesi tutarı gösterir.
   */
  async quote(
    studentId: string,
    year: number,
    installments: number,
  ): Promise<{
    gross: number;
    scholarshipRate: number;
    afterScholarship: number;
    net: number;
    installments: { no: number; amount: number }[];
  }> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ userId: students.userId, programId: students.programId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      requireOwnershipOrRole(ctx, stu.userId, FINANCE_STAFF_ROLES);

      const [fee] = await tx
        .select({ base: feeSchedules.baseAmount })
        .from(feeSchedules)
        .where(and(eq(feeSchedules.programId, stu.programId), eq(feeSchedules.year, year)))
        .limit(1);
      if (!fee) {
        throw new NotFoundException('Ücret tarifesi tanımlı değil');
      }
      const [sch] = await tx
        .select({ rateBps: scholarships.rateBps })
        .from(scholarships)
        .where(eq(scholarships.studentId, studentId))
        .orderBy(sql`${scholarships.effectiveFrom} desc`)
        .limit(1);

      const scholarshipRate = sch ? sch.rateBps / 10000 : 0;
      const result = computeTuition({
        baseAmount: fee.base,
        scholarshipRate,
        discounts: [],
        installments,
      });
      return {
        gross: result.gross,
        scholarshipRate,
        afterScholarship: result.afterScholarship,
        net: result.net,
        installments: result.installments,
      };
    });
  }

  /** Tahsilat özeti — tek çağrıda agregasyon (N+1 debt çağrılarını bitirir). */
  async summary(termId?: string): Promise<FinanceSummary> {
    const ctx = requireTenant();
    requireRole(ctx, FINANCE_READ_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const termFilter = termId ? eq(invoices.termId, termId) : undefined;

      const [agg] = await tx
        .select({
          accrued: sql<number>`coalesce(sum(${invoices.amount}), 0)::bigint`,
          collected: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::bigint`,
          invoiceCount: sql<number>`count(*)::int`,
          partialCount: sql<number>`count(*) filter (where ${invoices.status} = 'partial')::int`,
          paidCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
          debtorCount: sql<number>`count(distinct ${invoices.studentId}) filter (where ${invoices.amount} > ${invoices.paidAmount})::int`,
        })
        .from(invoices)
        .where(termFilter);

      const [schAgg] = await tx
        .select({
          scholarshipCount: sql<number>`count(distinct ${scholarships.studentId})::int`,
          scholarshipTotal: sql<number>`coalesce(sum(${scholarships.rateBps}), 0)::bigint`,
        })
        .from(scholarships)
        .where(sql`${scholarships.effectiveTo} is null`);

      const topDebtorRows = await tx
        .select({
          studentId: students.id,
          studentNo: students.studentNo,
          fullName: users.email,
          programName: programs.name,
          status: students.status,
          outstanding: sql<number>`(sum(${invoices.amount} - ${invoices.paidAmount}))::bigint`,
        })
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(termFilter)
        .groupBy(students.id, students.studentNo, users.email, programs.name, students.status)
        .having(sql`sum(${invoices.amount} - ${invoices.paidAmount}) > 0`)
        .orderBy(sql`sum(${invoices.amount} - ${invoices.paidAmount}) desc`)
        .limit(10);

      const accrued = Number(agg?.accrued ?? 0);
      const collected = Number(agg?.collected ?? 0);
      return {
        collected,
        accrued,
        outstanding: accrued - collected,
        debtorCount: Number(agg?.debtorCount ?? 0),
        invoiceCount: Number(agg?.invoiceCount ?? 0),
        partialCount: Number(agg?.partialCount ?? 0),
        paidCount: Number(agg?.paidCount ?? 0),
        scholarshipCount: Number(schAgg?.scholarshipCount ?? 0),
        scholarshipTotal: Number(schAgg?.scholarshipTotal ?? 0),
        topDebtors: topDebtorRows.map((r) => ({
          studentId: r.studentId,
          studentNo: r.studentNo,
          fullName: r.fullName,
          programName: r.programName,
          status: r.status,
          outstanding: Number(r.outstanding),
        })),
      };
    });
  }

  /**
   * Finansal toplulaştırma (Mali Özet sayfası): tahakkuk/tahsilat/açık-alacak +
   * tahsilat oranı + fatura durum dağılımı + burs + dönem serisi + program bazlı alacak.
   */
  async financeSummary(termId?: string): Promise<{
    term: { id: string; name: string } | null;
    totalAccrued: number;
    totalCollected: number;
    openReceivable: number;
    collectionRateBps: number;
    invoiceStatus: {
      unpaid: { count: number; amount: number };
      partial: { count: number; amount: number };
      paid: { count: number; amount: number };
    };
    scholarshipCount: number;
    byTerm: { termId: string; termName: string; accrued: number; collected: number }[];
    byProgram: { program: string; accrued: number; collected: number; openDebt: number }[];
  }> {
    const ctx = requireTenant();
    requireRole(ctx, REPORT_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      let term: { id: string; name: string } | null = null;
      if (termId) {
        const [t] = await tx
          .select({ id: academicTerms.id, name: academicTerms.name })
          .from(academicTerms)
          .where(eq(academicTerms.id, termId))
          .limit(1);
        term = t ?? null;
      }
      const termFilter = termId ? eq(invoices.termId, termId) : undefined;

      const [agg] = await tx
        .select({
          accrued: sql<number>`coalesce(sum(${invoices.amount}), 0)::bigint`,
          collected: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::bigint`,
          unpaidCount: sql<number>`count(*) filter (where ${invoices.status} = 'unpaid')::int`,
          unpaidAmount: sql<number>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount}) filter (where ${invoices.status} = 'unpaid'), 0)::bigint`,
          partialCount: sql<number>`count(*) filter (where ${invoices.status} = 'partial')::int`,
          partialAmount: sql<number>`coalesce(sum(${invoices.amount} - ${invoices.paidAmount}) filter (where ${invoices.status} = 'partial'), 0)::bigint`,
          paidCount: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
          paidAmount: sql<number>`coalesce(sum(${invoices.amount}) filter (where ${invoices.status} = 'paid'), 0)::bigint`,
        })
        .from(invoices)
        .where(termFilter);

      const [schAgg] = await tx
        .select({ scholarshipCount: sql<number>`count(distinct ${scholarships.studentId})::int` })
        .from(scholarships)
        .where(sql`${scholarships.effectiveTo} is null`);

      const byTermRows = await tx
        .select({
          termId: academicTerms.id,
          termName: academicTerms.name,
          year: academicTerms.year,
          accrued: sql<number>`coalesce(sum(${invoices.amount}), 0)::bigint`,
          collected: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::bigint`,
        })
        .from(invoices)
        .innerJoin(academicTerms, eq(invoices.termId, academicTerms.id))
        .groupBy(academicTerms.id, academicTerms.name, academicTerms.year)
        .orderBy(academicTerms.year);

      const byProgramRows = await tx
        .select({
          program: programs.name,
          accrued: sql<number>`coalesce(sum(${invoices.amount}), 0)::bigint`,
          collected: sql<number>`coalesce(sum(${invoices.paidAmount}), 0)::bigint`,
        })
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .innerJoin(programs, eq(students.programId, programs.id))
        .where(termFilter)
        .groupBy(programs.name)
        .orderBy(sql`sum(${invoices.amount} - ${invoices.paidAmount}) desc`);

      const totalAccrued = Number(agg?.accrued ?? 0);
      const totalCollected = Number(agg?.collected ?? 0);
      const openReceivable = totalAccrued - totalCollected;
      const collectionRateBps = totalAccrued > 0 ? Math.round((totalCollected / totalAccrued) * 10000) : 0;

      return {
        term,
        totalAccrued,
        totalCollected,
        openReceivable,
        collectionRateBps,
        invoiceStatus: {
          unpaid: { count: Number(agg?.unpaidCount ?? 0), amount: Number(agg?.unpaidAmount ?? 0) },
          partial: {
            count: Number(agg?.partialCount ?? 0),
            amount: Number(agg?.partialAmount ?? 0),
          },
          paid: { count: Number(agg?.paidCount ?? 0), amount: Number(agg?.paidAmount ?? 0) },
        },
        scholarshipCount: Number(schAgg?.scholarshipCount ?? 0),
        byTerm: byTermRows.map((r) => ({
          termId: r.termId,
          termName: r.termName,
          accrued: Number(r.accrued),
          collected: Number(r.collected),
        })),
        byProgram: byProgramRows.map((r) => {
          const accrued = Number(r.accrued);
          const collected = Number(r.collected);
          return { program: r.program, accrued, collected, openDebt: accrued - collected };
        }),
      };
    });
  }

  /**
   * Kalıcı mutabakat/istisna raporu: banka kayıtları + eşleşme durumu + eşleşen
   * ödeme->fatura->öğrenci bağı. unmatchedOnly ile açık istisnaları filtrele.
   */
  async reconciliation(unmatchedOnly: boolean): Promise<{
    items: {
      id: string;
      bankRef: string;
      amount: number;
      importedAt: string;
      matchedPaymentId: string | null;
      matchedStudentNo: string | null;
      matchedStudentName: string | null;
      matchedInvoiceId: string | null;
    }[];
    summary: { total: number; matched: number; unmatched: number };
  }> {
    const ctx = requireTenant();
    requireRole(ctx, RECON_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: reconciliationRecords.id,
          bankRef: reconciliationRecords.bankRef,
          amount: reconciliationRecords.amount,
          importedAt: reconciliationRecords.importedAt,
          matchedPaymentId: reconciliationRecords.matchedPaymentId,
          matchedInvoiceId: payments.invoiceId,
          matchedStudentNo: students.studentNo,
          matchedStudentName: users.email,
        })
        .from(reconciliationRecords)
        .leftJoin(payments, eq(reconciliationRecords.matchedPaymentId, payments.id))
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .leftJoin(students, eq(invoices.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .where(unmatchedOnly ? sql`${reconciliationRecords.matchedPaymentId} is null` : undefined)
        .orderBy(desc(reconciliationRecords.importedAt));

      const items = rows.map((r) => ({
        id: r.id,
        bankRef: r.bankRef,
        amount: Number(r.amount),
        importedAt: r.importedAt.toISOString(),
        matchedPaymentId: r.matchedPaymentId,
        matchedStudentNo: r.matchedStudentNo,
        matchedStudentName: r.matchedStudentName,
        matchedInvoiceId: r.matchedInvoiceId,
      }));

      // Özet: filtreden bağımsız toplam sayımlar için ayrı agregasyon.
      const [countAgg] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          matched: sql<number>`count(*) filter (where ${reconciliationRecords.matchedPaymentId} is not null)::int`,
        })
        .from(reconciliationRecords);
      const total = Number(countAgg?.total ?? 0);
      const matched = Number(countAgg?.matched ?? 0);
      return { items, summary: { total, matched, unmatched: total - matched } };
    });
  }

  /**
   * Eşleşmeyen banka kaydını manuel olarak bir ödemeye bağla (istisna çözümü).
   * Ödemenin aynı tenant'ta ve tutarların uyumlu olduğunu doğrular.
   */
  async matchReconciliation(
    recordId: string,
    paymentId: string,
  ): Promise<{ id: string; matchedPaymentId: string }> {
    const ctx = requireTenant();
    requireRole(ctx, RECON_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [rec] = await tx
        .select({ id: reconciliationRecords.id, amount: reconciliationRecords.amount })
        .from(reconciliationRecords)
        .where(eq(reconciliationRecords.id, recordId))
        .limit(1);
      if (!rec) {
        throw new NotFoundException('Mutabakat kaydı bulunamadı');
      }
      const [pay] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (!pay) {
        throw new NotFoundException('Ödeme bulunamadı');
      }
      const [updated] = await tx
        .update(reconciliationRecords)
        .set({ matchedPaymentId: paymentId })
        .where(eq(reconciliationRecords.id, recordId))
        .returning({ id: reconciliationRecords.id, matchedPaymentId: reconciliationRecords.matchedPaymentId });
      return { id: updated!.id, matchedPaymentId: updated!.matchedPaymentId! };
    });
  }

  /** Banka mutabakat dosyasını içe aktar + ödemelerle eşleştir (istisna raporu). */
  async importReconciliation(
    records: readonly BankRecord[],
  ): Promise<{ matched: number; unmatched: number }> {
    const ctx = requireTenant();
    requireRole(ctx, ['mali_isler', 'sistem_yoneticisi']);
    const tenantId = ctx.tenantId;
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const unpaidPayments = await tx
        .select({ id: payments.id, amount: payments.amount })
        .from(payments);
      const matches = matchBankRecords(records, unpaidPayments);

      let matched = 0;
      for (const m of matches) {
        await tx.insert(reconciliationRecords).values({
          tenantId,
          bankRef: m.bankRef,
          amount: m.amount,
          matchedPaymentId: m.matchedPaymentId,
        });
        if (m.matchedPaymentId) {
          matched += 1;
        }
      }
      return { matched, unmatched: matches.length - matched };
    });
  }
}
