import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { WellbeingService } from './wellbeing.service.js';

const createCounselingSchema = z.object({
  kind: z.enum(['bireysel', 'grup', 'atolye']),
  note: z.string().max(4000).optional(),
});
type CreateCounselingDto = z.infer<typeof createCounselingSchema>;

const updateCounselingSchema = z.object({
  appointmentAt: z.string().datetime().optional(),
  status: z.enum(['planlandi', 'tamamlandi', 'iptal', 'gelmedi']).optional(),
  note: z.string().max(4000).optional(),
  counselorUserId: z.string().uuid().optional(),
});
type UpdateCounselingDto = z.infer<typeof updateCounselingSchema>;

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
});
type RateDto = z.infer<typeof rateSchema>;

const createDisabilitySchema = z.object({
  studentId: z.string().uuid(),
  disabilityType: z.string().max(120).optional(),
  needs: z.string().max(2000).optional(),
  accommodations: z.string().max(2000).optional(),
  examExtraTimePct: z.number().int().min(0).max(100).optional(),
});
type CreateDisabilityDto = z.infer<typeof createDisabilitySchema>;

const createHealthSchema = z.object({
  studentId: z.string().uuid(),
  visitDate: z.string().date().optional(),
  complaint: z.string().max(2000).optional(),
  treatment: z.string().max(2000).optional(),
  referredTo: z.string().max(200).optional(),
});
type CreateHealthDto = z.infer<typeof createHealthSchema>;

@ApiTags('wellbeing')
@Controller('wellbeing')
export class WellbeingController {
  constructor(private readonly service: WellbeingService) {}

  @Get('counseling')
  @ApiOperation({ summary: 'PDR randevuları (dar personel; öğrenci no/ad join)' })
  listCounseling() {
    return this.service.listCounseling();
  }

  @Get('counseling/my')
  @ApiOperation({ summary: 'Aktör öğrencinin PDR randevuları (danışman notu hariç)' })
  myCounseling() {
    return this.service.myCounseling();
  }

  @Post('counseling')
  @ApiOperation({ summary: 'Aktör öğrenci randevu talebi (status=talep)' })
  createCounseling(@Body(new ZodValidationPipe(createCounselingSchema)) body: CreateCounselingDto) {
    return this.service.createCounseling(body);
  }

  @Patch('counseling/:id')
  @ApiOperation({ summary: 'PDR randevu güncelle (dar personel)' })
  updateCounseling(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCounselingSchema)) body: UpdateCounselingDto,
  ) {
    return this.service.updateCounseling(id, body);
  }

  @Post('counseling/:id/rate')
  @ApiOperation({ summary: 'Aktör öğrenci kendi randevusunu puanlar (1-5)' })
  rateCounseling(@Param('id') id: string, @Body(new ZodValidationPipe(rateSchema)) body: RateDto) {
    return this.service.rateCounseling(id, body.rating);
  }

  @Get('disability')
  @ApiOperation({ summary: 'Engelli destek kayıtları (dar personel)' })
  listDisability() {
    return this.service.listDisability();
  }

  @Post('disability')
  @ApiOperation({ summary: 'Engelli destek kaydı oluştur (dar personel)' })
  createDisability(@Body(new ZodValidationPipe(createDisabilitySchema)) body: CreateDisabilityDto) {
    return this.service.createDisability(body);
  }

  @Get('disability/my')
  @ApiOperation({ summary: 'Aktör öğrencinin engelli destek kaydı' })
  myDisability() {
    return this.service.myDisability();
  }

  @Get('health')
  @ApiOperation({ summary: 'Sağlık merkezi ziyaretleri (dar personel)' })
  listHealth() {
    return this.service.listHealth();
  }

  @Post('health')
  @ApiOperation({ summary: 'Sağlık ziyareti kaydı oluştur (dar personel)' })
  createHealth(@Body(new ZodValidationPipe(createHealthSchema)) body: CreateHealthDto) {
    return this.service.createHealth(body);
  }
}
