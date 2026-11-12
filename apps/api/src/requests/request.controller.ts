import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { RequestService } from './request.service.js';

const createSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['kayit_dondurma', 'mazeret_sinavi', 'belge', 'diger']),
  payload: z.record(z.unknown()).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const transitionSchema = z.object({
  to: z.enum(['in_review', 'approved', 'rejected', 'cancelled', 'submitted']),
  reason: z.string().max(500).optional(),
});
type TransitionDto = z.infer<typeof transitionSchema>;

@ApiTags('requests')
@Controller('requests')
export class RequestController {
  constructor(private readonly service: RequestService) {}

  @Post()
  @ApiOperation({ summary: 'Talep (dilekçe) oluştur' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body.studentId, body.type, body.payload ?? null);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Talep durum geçişi (incele/onayla/reddet/iptal)' })
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: TransitionDto,
  ) {
    return this.service.transition(id, body.to, body.reason);
  }
}
