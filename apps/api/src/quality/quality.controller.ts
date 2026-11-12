import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { QualityService } from './quality.service.js';

const createReviewSchema = z.object({
  programId: z.string().uuid(),
  year: z.number().int().min(1900).max(2200),
  studentCount: z.number().int().min(0).optional(),
  graduateCount: z.number().int().min(0).optional(),
  avgGpa: z.number().min(0).max(4).optional(),
  employmentRate: z.number().min(0).max(100).optional(),
  satisfaction: z.number().min(0).max(100).optional(),
  note: z.string().max(2000).optional(),
});
type CreateReviewDto = z.infer<typeof createReviewSchema>;

const createAccreditationSchema = z.object({
  programId: z.string().uuid(),
  body: z.string().min(1).max(60),
  cycle: z.string().max(60).optional(),
  visitDate: z.string().date().optional(),
  note: z.string().max(2000).optional(),
});
type CreateAccreditationDto = z.infer<typeof createAccreditationSchema>;

const updateAccreditationSchema = z.object({
  status: z.enum(['hazirlik', 'basvuru', 'saha_ziyareti', 'akredite', 'red']),
  visitDate: z.string().date().optional(),
  note: z.string().max(2000).optional(),
});
type UpdateAccreditationDto = z.infer<typeof updateAccreditationSchema>;

const createActionSchema = z.object({
  finding: z.string().min(1).max(2000),
  action: z.string().max(2000).optional(),
  dueOn: z.string().date().optional(),
});
type CreateActionDto = z.infer<typeof createActionSchema>;

const updateActionSchema = z.object({
  status: z.enum(['acik', 'devam', 'kapali']),
  action: z.string().max(2000).optional(),
});
type UpdateActionDto = z.infer<typeof updateActionSchema>;

@ApiTags('quality')
@Controller('quality')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  @Get('program-reviews')
  @ApiOperation({ summary: 'Program izleme kayıtları (personel; ?programId,?year)' })
  reviews(@Query('programId') programId?: string, @Query('year') year?: string) {
    return this.service.reviews(programId, year);
  }

  @Post('program-reviews')
  @ApiOperation({ summary: 'Program izleme kaydı (personel; aynı program+yıl 409)' })
  createReview(@Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewDto) {
    return this.service.createReview(body);
  }

  @Get('accreditation')
  @ApiOperation({ summary: 'Akreditasyon dosyaları + bulgu sayısı (personel; ?programId)' })
  accreditations(@Query('programId') programId?: string) {
    return this.service.accreditations(programId);
  }

  @Post('accreditation')
  @ApiOperation({ summary: 'Akreditasyon dosyası aç (personel; MÜDEK/FEDEK/ABET...)' })
  createAccreditation(
    @Body(new ZodValidationPipe(createAccreditationSchema)) body: CreateAccreditationDto,
  ) {
    return this.service.createAccreditation(body);
  }

  @Patch('accreditation/:id')
  @ApiOperation({
    summary: 'Akreditasyon durumu (personel; açık düzeltici eylem varsa akredite 409)',
  })
  updateAccreditation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccreditationSchema)) body: UpdateAccreditationDto,
  ) {
    return this.service.updateAccreditation(id, body);
  }

  @Get('accreditation/:id/actions')
  @ApiOperation({ summary: 'Dosyanın düzeltici eylemleri (personel)' })
  actions(@Param('id') id: string) {
    return this.service.actions(id);
  }

  @Post('accreditation/:id/actions')
  @ApiOperation({ summary: 'Bulgu + düzeltici eylem ekle (personel)' })
  createAction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createActionSchema)) body: CreateActionDto,
  ) {
    return this.service.createAction(id, body);
  }

  @Patch('actions/:id')
  @ApiOperation({ summary: 'Düzeltici eylem durumu (personel; acik/devam/kapali)' })
  updateAction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateActionSchema)) body: UpdateActionDto,
  ) {
    return this.service.updateAction(id, body);
  }
}
