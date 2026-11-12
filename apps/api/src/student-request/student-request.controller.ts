import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { StudentRequestService } from './student-request.service.js';

const createSchema = z.object({
  kind: z.enum(['dersten_cekilme', 'kayit_dondurma', 'ilisik_kesme', 'ucret_iadesi']),
  reason: z.string().max(2000).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const decisionSchema = z.object({
  status: z.enum(['incelemede', 'onaylandi', 'reddedildi']),
  decisionNote: z.string().max(2000).optional(),
});
type DecisionDto = z.infer<typeof decisionSchema>;

@ApiTags('student-requests')
@Controller('student-requests')
export class StudentRequestController {
  constructor(private readonly service: StudentRequestService) {}

  @Get('my')
  @ApiOperation({ summary: 'Aktör öğrencinin talepleri' })
  my() {
    return this.service.my();
  }

  @Get('my-discipline')
  @ApiOperation({ summary: 'Aktör öğrencinin disiplin cezası kayıtları' })
  myDiscipline() {
    return this.service.myDiscipline();
  }

  @Post()
  @ApiOperation({ summary: 'Öğrenci self-servis talep oluştur (aktör öğrenci)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Talep kuyruğu (personel; ?kind,?status; öğrenci no/ad join)' })
  list(@Query('kind') kind?: string, @Query('status') status?: string) {
    return this.service.list(kind, status);
  }

  @Get(':id/approval')
  @ApiOperation({ summary: 'Talebin onay süreci (instance + adımlar + aksiyonlar; yoksa null)' })
  approval(@Param('id') id: string) {
    return this.service.approval(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Talep kararı (personel; status/decisionNote)' })
  decide(@Param('id') id: string, @Body(new ZodValidationPipe(decisionSchema)) body: DecisionDto) {
    return this.service.decide(id, body);
  }
}
