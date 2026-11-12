import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { requireOwnershipOrRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { invoices, payments } from '../db/schema-finance.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

export interface PaymentResult {
  paymentId: string;
  /** true ise bu callback zaten işlenmişti (idempotent tekrar). */
  idempotent: boolean;
  invoiceStatus: string;
}

/**
 * Ödeme servisi. İDEMPOTENT: aynı idempotency_key ile gelen callback iki kez
 * gelse tek ödeme kaydı olur, fatura tek kez güncellenir (master prompt §4
 * "ödeme callback'leri idempotent"). Kayıt + fatura güncellemesi tek transaction.
 */
@Injectable()
export class PaymentService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async recordPayment(
    invoiceId: string,
    amount: number,
    idempotencyKey: string,
    provider = 'mock',
    providerRef?: string,
  ): Promise<PaymentResult> {
    const ctx = requireTenant();

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // Yetki: fatura sahibi öğrenci veya mali_isler/sistem yöneticisi.
      const [owner] = await tx
        .select({ userId: students.userId })
        .from(invoices)
        .innerJoin(students, eq(invoices.studentId, students.id))
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!owner) {
        throw new NotFoundException('Fatura bulunamadı');
      }
      requireOwnershipOrRole(ctx, owner.userId, ['mali_isler', 'sistem_yoneticisi']);

      // Atomik idempotent ekleme: çakışırsa (aynı key) satır dönmez.
      const inserted = await tx
        .insert(payments)
        .values({
          tenantId: ctx.tenantId,
          invoiceId,
          amount,
          provider,
          idempotencyKey,
          providerRef: providerRef ?? null,
        })
        .onConflictDoNothing({ target: [payments.tenantId, payments.idempotencyKey] })
        .returning({ id: payments.id });

      if (inserted.length === 0) {
        // Zaten işlenmiş (idempotent tekrar) — fatura İKİNCİ kez güncellenmez.
        const [existing] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.tenantId, ctx.tenantId), eq(payments.idempotencyKey, idempotencyKey)))
          .limit(1);
        const [inv] = await tx
          .select({ status: invoices.status })
          .from(invoices)
          .where(eq(invoices.id, invoiceId))
          .limit(1);
        return {
          paymentId: existing!.id,
          idempotent: true,
          invoiceStatus: inv?.status ?? 'unpaid',
        };
      }

      // Yeni ödeme: faturayı atomik güncelle.
      const [inv] = await tx
        .update(invoices)
        .set({ paidAmount: sql`${invoices.paidAmount} + ${amount}` })
        .where(eq(invoices.id, invoiceId))
        .returning({ amount: invoices.amount, paidAmount: invoices.paidAmount });
      if (!inv) {
        throw new NotFoundException('Fatura bulunamadı');
      }
      const newStatus = inv.paidAmount >= inv.amount ? 'paid' : 'partial';
      await tx.update(invoices).set({ status: newStatus }).where(eq(invoices.id, invoiceId));

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'payment.kaydedildi',
        resourceType: 'payment',
        resourceId: inserted[0]!.id,
        diff: { invoiceId, amount, provider, invoiceStatus: newStatus },
      });

      return { paymentId: inserted[0]!.id, idempotent: false, invoiceStatus: newStatus };
    });
  }
}
