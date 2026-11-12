import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { DiplomaService } from './diploma.service.js';

const graduateSchema = z.object({
  studentId: z.string().uuid(),
  graduationDate: z.string().date(),
  degree: z.string().min(1).max(120),
  decisionNo: z.string().max(120).optional(),
  decisionDate: z.string().date().optional(),
});
type GraduateDto = z.infer<typeof graduateSchema>;

const updateSchema = z.object({
  diplomaNo: z.string().max(120).optional(),
  serialNo: z.string().max(120).optional(),
  rankNo: z.number().int().min(1).optional(),
  status: z.string().min(1).max(60).optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('diploma')
@Controller('diploma')
export class DiplomaController {
  constructor(private readonly service: DiplomaService) {}

  @Get()
  @ApiOperation({ summary: 'Mezuniyet defteri (diplomalar + öğrenci no/ad)' })
  list() {
    return this.service.list();
  }

  @Post('graduate')
  @ApiOperation({ summary: 'Öğrenci mezun et → diploma oluştur (idempotent, ÖİDB + audit)' })
  graduate(@Body(new ZodValidationPipe(graduateSchema)) body: GraduateDto) {
    return this.service.graduate(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Diploma güncelle (diplomaNo/serialNo/rankNo/status)' })
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto) {
    return this.service.update(id, body);
  }
}
