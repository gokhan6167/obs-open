import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { InternshipService } from './internship.service.js';

const createSchema = z.object({
  company: z.string().min(1).max(200),
  position: z.string().max(200).optional(),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  days: z.number().int().min(1).max(400).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  status: z.enum(['onaylandi', 'devam', 'tamamlandi', 'reddedildi']).optional(),
  insuranceDone: z.boolean().optional(),
  logbookSubmitted: z.boolean().optional(),
  companyRating: z.number().int().min(1).max(5).optional(),
  grade: z.string().min(1).max(60).optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('internships')
@Controller('internships')
export class InternshipController {
  constructor(private readonly service: InternshipService) {}

  @Get('my')
  @ApiOperation({ summary: 'Aktör öğrencinin staj kayıtları' })
  my() {
    return this.service.my();
  }

  @Post()
  @ApiOperation({ summary: 'Staj başvurusu (aktör öğrenci; status=basvuruldu)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Staj kuyruğu (personel; ?status; öğrenci no/ad join)' })
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Staj güncelle (personel; sigorta/defter kuralları)' })
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto) {
    return this.service.update(id, body);
  }
}
