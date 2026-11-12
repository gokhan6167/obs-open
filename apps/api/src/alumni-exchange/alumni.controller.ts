import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AlumniService } from './alumni.service.js';

const createSchema = z.object({
  fullName: z.string().min(1).max(200),
  graduationYear: z.number().int().min(1900).max(2100).optional(),
  programName: z.string().max(200).optional(),
  email: z.string().email().max(320).optional(),
  employment: z.string().max(500).optional(),
  studentId: z.string().uuid().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('alumni')
@Controller('alumni')
export class AlumniController {
  constructor(private readonly service: AlumniService) {}

  @Get()
  @ApiOperation({ summary: 'Mezun listesi (opsiyonel ?year mezuniyet yılı filtresi)' })
  list(@Query('year') year?: string) {
    return this.service.list(year !== undefined ? Number(year) : undefined);
  }

  @Post()
  @ApiOperation({ summary: 'Mezun kaydı oluştur (personel + audit)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }
}
