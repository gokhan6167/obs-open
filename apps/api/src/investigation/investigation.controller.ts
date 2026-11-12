import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { InvestigationService } from './investigation.service.js';

const createSchema = z.object({
  studentId: z.string().uuid(),
  complaint: z.string().min(1).max(4000),
  investigatorUserId: z.string().uuid().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  stage: z.enum(['on_inceleme', 'sorusturma', 'karar', 'itiraz', 'kapali']).optional(),
  evidence: z.string().max(8000).optional(),
  decision: z.string().max(8000).optional(),
  decisionNo: z.string().max(120).optional(),
  decisionDate: z.string().date().optional(),
  investigatorUserId: z.string().uuid().nullish(),
});
type UpdateDto = z.infer<typeof updateSchema>;

const applyPenaltySchema = z.object({
  category: z.string().min(1).max(120),
  penalty: z.string().min(1).max(120),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
});
type ApplyPenaltyDto = z.infer<typeof applyPenaltySchema>;

@ApiTags('investigations')
@Controller('investigations')
export class InvestigationController {
  constructor(private readonly service: InvestigationService) {}

  @Get()
  @ApiOperation({ summary: 'Disiplin soruşturmaları (personel; ?stage,?studentId)' })
  list(@Query('stage') stage?: string, @Query('studentId') studentId?: string) {
    return this.service.list(stage, studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Soruşturma detayı (personel; ceza kaydı dahil)' })
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  @ApiOperation({ summary: 'Soruşturma aç (personel; stage=ihbar)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Soruşturmayı güncelle (personel; aşama geçiş kuralları)' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto,
  ) {
    return this.service.update(id, body);
  }

  @Post(':id/apply-penalty')
  @ApiOperation({ summary: 'Karardan ceza üret (personel; yalnızca karar/kapalı aşamasında)' })
  applyPenalty(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applyPenaltySchema)) body: ApplyPenaltyDto,
  ) {
    return this.service.applyPenalty(id, body);
  }
}
