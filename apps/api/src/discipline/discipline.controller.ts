import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { DisciplineService } from './discipline.service.js';

const createSchema = z.object({
  studentId: z.string().uuid(),
  category: z.string().min(1).max(120),
  penalty: z.string().min(1).max(120),
  reason: z.string().max(2000).optional(),
  decisionNo: z.string().max(120).optional(),
  decisionDate: z.string().date().optional(),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('discipline')
@Controller('discipline')
export class DisciplineController {
  constructor(private readonly service: DisciplineService) {}

  @Get()
  @ApiOperation({ summary: 'Disiplin cezaları listesi (opsiyonel ?studentId; öğrenci adı/no)' })
  list(@Query('studentId') studentId?: string) {
    return this.service.list(studentId);
  }

  @Post()
  @ApiOperation({ summary: 'Disiplin cezası oluştur (personel + audit)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }
}
