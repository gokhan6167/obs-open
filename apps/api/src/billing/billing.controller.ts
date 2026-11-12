import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { BillingService } from './billing.service.js';

const createPlanSchema = z.object({
  studentId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  term: z.string().max(60).optional(),
  // Kuruş (integer).
  totalAmount: z.number().int().min(1),
  installmentCount: z.number().int().min(1).max(24),
  firstDueOn: z.string().date().optional(),
});
type CreatePlanDto = z.infer<typeof createPlanSchema>;

const paySchema = z.object({
  // Kuruş (integer).
  amount: z.number().int().min(1),
  method: z.enum(['havale', 'kart', 'nakit']),
  paidOn: z.string().date().optional(),
});
type PayDto = z.infer<typeof paySchema>;

const createRefundSchema = z.object({
  // Kuruş (integer).
  amount: z.number().int().min(1),
  iban: z.string().min(10).max(34),
  accountHolder: z.string().min(1).max(200),
  bank: z.string().min(1).max(200),
  reason: z.string().max(2000).optional(),
});
type CreateRefundDto = z.infer<typeof createRefundSchema>;

const decideRefundSchema = z.object({
  status: z.enum(['onaylandi', 'odendi', 'reddedildi']),
});
type DecideRefundDto = z.infer<typeof decideRefundSchema>;

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Ödeme planları (personel; ?studentId; öğrenci adı + taksit özeti)' })
  listPlans(@Query('studentId') studentId?: string) {
    return this.service.listPlans(studentId);
  }

  @Get('plans/my')
  @ApiOperation({ summary: 'Aktör öğrencinin ödeme planları' })
  myPlans() {
    return this.service.myPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Ödeme planı oluştur (personel; taksitler otomatik üretilir)' })
  createPlan(@Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanDto) {
    return this.service.createPlan(body);
  }

  @Get('plans/:id/installments')
  @ApiOperation({ summary: 'Planın sıralı taksitleri' })
  installments(@Param('id') id: string) {
    return this.service.installments(id);
  }

  @Post('installments/:id/pay')
  @ApiOperation({ summary: 'Taksit tahsilatı (personel; fazla ödeme 409)' })
  pay(@Param('id') id: string, @Body(new ZodValidationPipe(paySchema)) body: PayDto) {
    return this.service.pay(id, body);
  }

  @Get('refunds')
  @ApiOperation({ summary: 'İade talepleri (personel; ?status; öğrenci adı)' })
  listRefunds(@Query('status') status?: string) {
    return this.service.listRefunds(status);
  }

  @Get('refunds/my')
  @ApiOperation({ summary: 'Aktör öğrencinin iade talepleri' })
  myRefunds() {
    return this.service.myRefunds();
  }

  @Post('refunds')
  @ApiOperation({ summary: 'İade talebi aç (aktör öğrenci)' })
  createRefund(@Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundDto) {
    return this.service.createRefund(body);
  }

  @Patch('refunds/:id')
  @ApiOperation({ summary: 'İade kararı (personel; odendi için önce onaylandi olmalı)' })
  decideRefund(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideRefundSchema)) body: DecideRefundDto,
  ) {
    return this.service.decideRefund(id, body);
  }
}
