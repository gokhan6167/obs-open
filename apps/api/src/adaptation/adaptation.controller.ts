import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdaptationService } from './adaptation.service.js';

const createSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['intibak', 'muaf', 'transfer']),
  sourceCourse: z.string().min(1).max(240),
  targetCurriculumCourseId: z.string().uuid().optional(),
  letter: z.string().max(10).optional(),
  decisionNo: z.string().max(120).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('adaptation')
@Controller('adaptation')
export class AdaptationController {
  constructor(private readonly service: AdaptationService) {}

  @Get()
  @ApiOperation({ summary: 'İntibak/muaf/transfer listesi (opsiyonel ?studentId; öğrenci adı/no)' })
  list(@Query('studentId') studentId?: string) {
    return this.service.list(studentId);
  }

  @Post()
  @ApiOperation({ summary: 'İntibak/muaf/transfer kaydı oluştur (personel + audit)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }
}
