import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ThesisService } from './thesis.service.js';

const createSchema = z.object({
  title: z.string().min(1).max(300),
  summary: z.string().max(4000).optional(),
  advisorUserId: z.string().uuid().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const decideSchema = z.object({
  status: z.enum(['onaylandi', 'reddedildi']),
  decisionNote: z.string().max(2000).optional(),
});
type DecideDto = z.infer<typeof decideSchema>;

@ApiTags('thesis')
@Controller('thesis')
export class ThesisController {
  constructor(private readonly service: ThesisService) {}

  @Get('my')
  @ApiOperation({ summary: 'Aktör öğrencinin tez/proje başvuruları' })
  my() {
    return this.service.my();
  }

  @Post()
  @ApiOperation({ summary: 'Tez/proje konusu başvurusu oluştur (aktör öğrenci)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Tez başvuru kuyruğu (personel; öğrenci + danışman join)' })
  list() {
    return this.service.list();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Tez başvurusuna karar (onaylandı/reddedildi; personel/danışman)' })
  decide(@Param('id') id: string, @Body(new ZodValidationPipe(decideSchema)) body: DecideDto) {
    return this.service.decide(id, body);
  }
}
