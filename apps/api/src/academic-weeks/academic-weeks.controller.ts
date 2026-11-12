import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AcademicWeeksService } from './academic-weeks.service.js';

const createAcademicWeekSchema = z.object({
  year: z.number().int(),
  term: z.string().min(1).max(120),
  weekNo: z.number().int().min(1),
  startsOn: z.string().optional(),
  note: z.string().max(500).optional(),
});
type CreateAcademicWeekDto = z.infer<typeof createAcademicWeekSchema>;

@ApiTags('academic-weeks')
@Controller('academic-weeks')
export class AcademicWeeksController {
  constructor(private readonly service: AcademicWeeksService) {}

  @Get()
  @ApiOperation({ summary: 'Akademik hafta listesi (opsiyonel ?year, ?term) (personel)' })
  list(@Query('year') year?: string, @Query('term') term?: string) {
    return this.service.list(year !== undefined ? Number(year) : undefined, term);
  }

  @Post()
  @ApiOperation({ summary: 'Akademik hafta oluştur (personel); aynı year+term+weekNo 409' })
  create(@Body(new ZodValidationPipe(createAcademicWeekSchema)) body: CreateAcademicWeekDto) {
    return this.service.create(body);
  }
}
