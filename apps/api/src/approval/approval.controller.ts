import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ApprovalService } from './approval.service.js';

const createFlowSchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
type CreateFlowDto = z.infer<typeof createFlowSchema>;

const createStepSchema = z.object({
  stepNo: z.number().int().min(1).max(50),
  unit: z.string().min(1).max(120),
  // UI boş bırakınca null gelir ("herkes/staff" anlamında) — null kabul edilir.
  roleKey: z.string().min(1).max(60).nullish(),
  name: z.string().min(1).max(200),
  slaDays: z.number().int().min(0).max(365).nullish(),
});
type CreateStepDto = z.infer<typeof createStepSchema>;

const startInstanceSchema = z.object({
  flowKey: z.string().min(1).max(120),
  subjectType: z.string().min(1).max(120),
  subjectId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
});
type StartInstanceDto = z.infer<typeof startInstanceSchema>;

const actionSchema = z.object({
  action: z.enum(['onay', 'red', 'iade', 'not']),
  note: z.string().max(2000).optional(),
});
type ActionDto = z.infer<typeof actionSchema>;

@ApiTags('approval')
@Controller('approval')
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Get('flows')
  @ApiOperation({ summary: 'Onay akışları + adım sayısı' })
  flows() {
    return this.service.flows();
  }

  @Post('flows')
  @ApiOperation({ summary: 'Onay akışı tanımla (personel; aynı key 409)' })
  createFlow(@Body(new ZodValidationPipe(createFlowSchema)) body: CreateFlowDto) {
    return this.service.createFlow(body);
  }

  @Get('flows/:id/steps')
  @ApiOperation({ summary: 'Akışın sıralı adımları' })
  steps(@Param('id') id: string) {
    return this.service.steps(id);
  }

  @Post('flows/:id/steps')
  @ApiOperation({ summary: 'Akışa adım ekle (personel; aynı flow+stepNo 409)' })
  createStep(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createStepSchema)) body: CreateStepDto,
  ) {
    return this.service.createStep(id, body);
  }

  @Post('instances')
  @ApiOperation({ summary: 'Onay akışını başlat (flowKey; aynı konuda devam eden varsa o döner)' })
  startInstance(@Body(new ZodValidationPipe(startInstanceSchema)) body: StartInstanceDto) {
    return this.service.startInstance(body);
  }

  @Get('instances')
  @ApiOperation({ summary: 'Onay kuyruğu (personel; ?status,?subjectType)' })
  instances(@Query('status') status?: string, @Query('subjectType') subjectType?: string) {
    return this.service.instances(status, subjectType);
  }

  @Get('my-queue')
  @ApiOperation({ summary: 'Aktörün rolüne düşen bekleyen onaylar (SLA aşım flagi)' })
  myQueue() {
    return this.service.myQueue();
  }

  @Get('instances/:id')
  @ApiOperation({ summary: 'Onay kaydı tam detay (akış + adımlar + aksiyon geçmişi)' })
  instanceDetail(@Param('id') id: string) {
    return this.service.instanceDetail(id);
  }

  @Post('instances/:id/action')
  @ApiOperation({ summary: 'Adım aksiyonu (personel; onay/red/iade/not)' })
  act(@Param('id') id: string, @Body(new ZodValidationPipe(actionSchema)) body: ActionDto) {
    return this.service.act(id, body);
  }
}
