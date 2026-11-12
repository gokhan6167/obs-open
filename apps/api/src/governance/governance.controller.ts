import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { GovernanceService } from './governance.service.js';

const createSessionSchema = z.object({
  sessionNo: z.string().min(1).max(120),
  date: z.string().date(),
});
type CreateSessionDto = z.infer<typeof createSessionSchema>;

const createDecisionSchema = z.object({
  decisionNo: z.string().min(1).max(120),
  subject: z.string().min(1).max(2000),
  outcome: z.string().min(1).max(120),
  reason: z.string().max(2000).optional(),
  linkedRequestId: z.string().uuid().optional(),
  linkedDoubleMajorId: z.string().uuid().optional(),
});
type CreateDecisionDto = z.infer<typeof createDecisionSchema>;

@ApiTags('governance')
@Controller('governance')
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Fakülte yönetim kurulu (YKK) toplantıları listesi' })
  listSessions() {
    return this.service.listSessions();
  }

  @Post('sessions')
  @ApiOperation({ summary: 'YKK toplantısı oluştur (personel + audit)' })
  createSession(@Body(new ZodValidationPipe(createSessionSchema)) body: CreateSessionDto) {
    return this.service.createSession(body);
  }

  @Get('sessions/:id/decisions')
  @ApiOperation({ summary: 'Toplantı kararları listesi' })
  listDecisions(@Param('id') id: string) {
    return this.service.listDecisions(id);
  }

  @Post('sessions/:id/decisions')
  @ApiOperation({ summary: 'Toplantıya karar ekle (personel + audit)' })
  createDecision(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDecisionSchema)) body: CreateDecisionDto,
  ) {
    return this.service.createDecision(id, body);
  }
}
