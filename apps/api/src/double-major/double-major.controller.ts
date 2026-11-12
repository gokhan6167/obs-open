import { Body, Controller, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { DoubleMajorService } from './double-major.service.js';

const applySchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['cap', 'yandal']),
  targetProgramId: z.string().uuid(),
});
type ApplyDto = z.infer<typeof applySchema>;

const transitionSchema = z.object({
  to: z.enum(['in_review', 'approved', 'rejected', 'cancelled', 'submitted']),
  reason: z.string().max(500).optional(),
});
type TransitionDto = z.infer<typeof transitionSchema>;

@ApiTags('double-major')
@Controller('double-major')
export class DoubleMajorController {
  constructor(private readonly service: DoubleMajorService) {}

  @Post()
  @ApiOperation({ summary: 'ÇAP/Yandal başvurusu (uygunluk otomatik kontrol edilir)' })
  apply(@Body(new ZodValidationPipe(applySchema)) body: ApplyDto, @Query('date') date?: string) {
    const onDate = date ?? new Date().toISOString().slice(0, 10);
    return this.service.apply(body.studentId, body.type, body.targetProgramId, onDate);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Komisyon kararı (incele/onayla/reddet) / öğrenci iptal' })
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: TransitionDto,
  ) {
    return this.service.transition(id, body.to, body.reason);
  }
}
