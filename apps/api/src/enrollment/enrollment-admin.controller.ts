import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { EnrollmentService } from './enrollment.service.js';

const quotaSchema = z.object({
  quota: z.number().int().min(0).max(1000),
});
type QuotaDto = z.infer<typeof quotaSchema>;

const createSectionSchema = z.object({
  courseId: z.string().uuid(),
  termId: z.string().uuid(),
  code: z.string().min(1).max(20),
  quota: z.number().int().min(0).max(1000),
});
type CreateSectionDto = z.infer<typeof createSectionSchema>;

const dmTransitionSchema = z.object({
  to: z.enum(['in_review', 'approved', 'rejected', 'cancelled', 'submitted']),
  reason: z.string().max(500).optional(),
});
type DmTransitionDto = z.infer<typeof dmTransitionSchema>;

/**
 * Enrollment domain'inin yazma uçları farklı route prefix'leriyle (sections,
 * double-major) ama EnrollmentModule'e ait olarak tutulur. Böylece kontenjan
 * baskısı ve ÇAP sekreter geçişi enrollment servisinden yönetilir.
 */
@ApiTags('enrollment')
@Controller()
export class EnrollmentAdminController {
  constructor(private readonly service: EnrollmentService) {}

  @Post('enrollment/sections')
  @ApiOperation({
    summary: 'Şube (ders) aç (bölüm başkanı/koordinatör/ÖİDB) — aynı ders/dönem/kod varsa 409',
  })
  createSection(@Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionDto) {
    return this.service.createSection(body);
  }

  @Patch('sections/:id/quota')
  @ApiOperation({
    summary: 'Şube kontenjanını güncelle (bölüm başkanı/koordinatör/ÖİDB, kendi bölümü)',
  })
  updateQuota(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quotaSchema)) body: QuotaDto,
  ) {
    return this.service.updateSectionQuota(id, body.quota);
  }

  @Patch('double-major/:id/transition')
  @ApiOperation({
    summary:
      'ÇAP/Yandal durum geçişi — gündeme alma (in_review) fakülte sekreteri; onay/ret dekanlık',
  })
  doubleMajorTransition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(dmTransitionSchema)) body: DmTransitionDto,
  ) {
    return this.service.doubleMajorTransition(id, body.to, body.reason);
  }
}
