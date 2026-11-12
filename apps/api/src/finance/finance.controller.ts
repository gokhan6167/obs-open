import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { FinanceService } from './finance.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider.js';
import { PaymentService } from './payment.service.js';

const invoiceSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  year: z.number().int(),
});
type InvoiceDto = z.infer<typeof invoiceSchema>;

const paySchema = z.object({
  amount: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
});
type PayDto = z.infer<typeof paySchema>;

const reconSchema = z.object({
  records: z.array(z.object({ bankRef: z.string(), amount: z.number().int() })),
});
type ReconDto = z.infer<typeof reconSchema>;

const matchSchema = z.object({ paymentId: z.string().uuid() });
type MatchDto = z.infer<typeof matchSchema>;

const scholarshipSchema = z.object({
  studentId: z.string().uuid(),
  rateBps: z.number().int().min(0).max(10000),
  provider: z.string().min(1).optional(),
});
type ScholarshipDto = z.infer<typeof scholarshipSchema>;

const feeScheduleSchema = z.object({
  programId: z.string().uuid(),
  year: z.number().int(),
  baseAmount: z.number().int().min(0),
});
type FeeScheduleDto = z.infer<typeof feeScheduleSchema>;

const debtTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});
type DebtTypeDto = z.infer<typeof debtTypeSchema>;

@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly payments: PaymentService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Post('invoices')
  @ApiOperation({ summary: 'Fatura üret (ücret tarifesi + burs -> net)' })
  createInvoice(@Body(new ZodValidationPipe(invoiceSchema)) body: InvoiceDto) {
    return this.finance.createInvoice(body.studentId, body.termId, body.year);
  }

  @Post('invoices/:id/pay')
  @ApiOperation({ summary: 'Ödeme (vPOS + idempotent callback)' })
  async pay(@Param('id') id: string, @Body(new ZodValidationPipe(paySchema)) body: PayDto) {
    const charge = await this.provider.charge({
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
    });
    return this.payments.recordPayment(id, body.amount, body.idempotencyKey, 'mock', charge.providerRef);
  }

  @Get('students/:id/debt')
  @ApiOperation({ summary: 'Öğrencinin kalan borcu (kuruş)' })
  async debt(@Param('id') id: string) {
    return { studentId: id, outstanding: await this.finance.outstandingDebt(id) };
  }

  @Get('students/:id/invoices')
  @ApiOperation({ summary: 'Öğrencinin fatura listesi (dönem/tutar/ödenen/kalan/durum)' })
  studentInvoices(@Param('id') id: string) {
    return this.finance.studentInvoices(id);
  }

  @Get('students/:id/payments')
  @ApiOperation({ summary: 'Öğrencinin ödeme/dekont geçmişi (makbuz)' })
  studentPayments(@Param('id') id: string) {
    return this.finance.studentPayments(id);
  }

  @Get('students/:id/statement')
  @ApiOperation({ summary: 'Öğrencinin tam mali ekstresi (fatura+ödeme+burs+toplam)' })
  statement(@Param('id') id: string) {
    return this.finance.studentStatement(id);
  }

  @Get('students/:id/quote')
  @ApiOperation({ summary: 'Fatura kesmeden tahakkuk önizlemesi (brüt/burs/net/taksit)' })
  quote(
    @Param('id') id: string,
    @Query('year') year?: string,
    @Query('installments') installments?: string,
  ) {
    const y = year ? Number.parseInt(year, 10) : new Date().getFullYear();
    const n = installments ? Number.parseInt(installments, 10) : 1;
    return this.finance.quote(id, Number.isFinite(y) ? y : new Date().getFullYear(), Number.isFinite(n) && n >= 1 ? n : 1);
  }

  @Get('scholarships')
  @ApiOperation({ summary: 'Tenant bursları — öğrenci adı/no join ile liste' })
  listScholarships() {
    return this.finance.listScholarships();
  }

  @Post('scholarships')
  @ApiOperation({ summary: 'Burs ekle (öğrenci + oran bps + sağlayıcı)' })
  createScholarship(@Body(new ZodValidationPipe(scholarshipSchema)) body: ScholarshipDto) {
    return this.finance.createScholarship(body.studentId, body.rateBps, body.provider);
  }

  @Get('fee-schedules')
  @ApiOperation({ summary: 'Ücret tarifeleri — program adı/kodu join ile liste' })
  listFeeSchedules() {
    return this.finance.listFeeSchedules();
  }

  @Post('fee-schedules')
  @ApiOperation({ summary: 'Ücret tarifesi ekle (program + yıl + tutar; çakışma 409)' })
  createFeeSchedule(@Body(new ZodValidationPipe(feeScheduleSchema)) body: FeeScheduleDto) {
    return this.finance.createFeeSchedule(body.programId, body.year, body.baseAmount);
  }

  @Get('debt-types')
  @ApiOperation({ summary: 'Borç türleri listesi (kod/ad/aktif)' })
  listDebtTypes() {
    return this.finance.listDebtTypes();
  }

  @Post('debt-types')
  @ApiOperation({ summary: 'Borç türü ekle (kod + ad; aynı kod 409)' })
  createDebtType(@Body(new ZodValidationPipe(debtTypeSchema)) body: DebtTypeDto) {
    return this.finance.createDebtType(body.code, body.name);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Tahsilat özeti — tek çağrıda agregasyon (?termId opsiyonel)' })
  summary(@Query('termId') termId?: string) {
    return this.finance.summary(termId);
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'Mutabakat/istisna raporu (?unmatched=true ile açık istisnalar)' })
  reconciliationReport(@Query('unmatched') unmatched?: string) {
    return this.finance.reconciliation(unmatched === 'true');
  }

  @Post('reconciliation/import')
  @ApiOperation({ summary: 'Banka mutabakat dosyasını içe aktar + eşleştir' })
  reconcile(@Body(new ZodValidationPipe(reconSchema)) body: ReconDto) {
    return this.finance.importReconciliation(body.records);
  }

  @Post('reconciliation/:id/match')
  @ApiOperation({ summary: 'Eşleşmeyen banka kaydını manuel ödemeye bağla (istisna çözümü)' })
  matchReconciliation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(matchSchema)) body: MatchDto,
  ) {
    return this.finance.matchReconciliation(id, body.paymentId);
  }
}
