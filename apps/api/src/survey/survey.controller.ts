import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { SurveyService } from './survey.service.js';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  kind: z.enum(['anket', 'degerlendirme']),
});
type CreateDto = z.infer<typeof createSchema>;

const respondSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});
type RespondDto = z.infer<typeof respondSchema>;

@ApiTags('surveys')
@Controller('surveys')
export class SurveyController {
  constructor(private readonly service: SurveyService) {}

  @Get()
  @ApiOperation({ summary: 'Aktif anketler + aktörün cevaplayıp cevaplamadığı' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Anket/değerlendirme oluştur (personel + audit)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get(':id/responses')
  @ApiOperation({ summary: 'Anket cevap sayısı/özeti (personel)' })
  responses(@Param('id') id: string) {
    return this.service.responses(id);
  }

  @Post(':id/respond')
  @ApiOperation({ summary: 'Ankete cevap ver (aktör, kişi başı tek cevap)' })
  respond(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(respondSchema)) body: RespondDto,
  ) {
    return this.service.respond(id, body);
  }
}
