import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CalendarService } from '../calendar/calendar.service.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { EnrollmentService } from './enrollment.service.js';

const enrollSchema = z.object({
  studentId: z.string().uuid(),
  sectionId: z.string().uuid(),
});
type EnrollDto = z.infer<typeof enrollSchema>;

const transitionSchema = z.object({
  to: z.enum(['draft', 'submitted', 'approved', 'rejected', 'withdrawn']),
  reason: z.string().max(500).optional(),
});
type TransitionDto = z.infer<typeof transitionSchema>;

@ApiTags('enrollment')
@Controller('enrollment')
export class EnrollmentController {
  constructor(
    private readonly service: EnrollmentService,
    private readonly calendar: CalendarService,
  ) {}

  @Post('enroll')
  @ApiOperation({ summary: 'Şubeye kayıt (sepete ekle) — kayıt penceresi açıkken, atomik kontenjan' })
  async enroll(@Body(new ZodValidationPipe(enrollSchema)) body: EnrollDto) {
    // Takvim geçidi: kayıt yalnızca 'kayit' penceresi açıkken.
    const termId = await this.service.sectionTermId(body.sectionId);
    if (!termId) {
      throw new NotFoundException('Şube bulunamadı');
    }
    const open = await this.calendar.isOpen(termId, 'kayit', new Date().toISOString());
    if (!open) {
      throw new ConflictException('Ders kayıt dönemi kapalı');
    }
    return this.service.enroll(body.studentId, body.sectionId);
  }

  @Get('stats/:termId')
  @ApiOperation({ summary: 'Kayıt haftası canlı izleme: doluluk + durum özeti' })
  stats(@Param('termId') termId: string) {
    return this.service.termStats(termId);
  }

  @Get('pending')
  @ApiOperation({
    summary:
      'Bekleyen ders kayıt onay kuyruğu — gerçek ön koşul/çakışma/kontenjan + danışman onayı',
  })
  pending() {
    return this.service.pendingEnrollments();
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Kayıt durum geçişi (gönder/onay/ret/çekilme)' })
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: TransitionDto,
  ) {
    return this.service.transition(id, body.to, body.reason);
  }
}
