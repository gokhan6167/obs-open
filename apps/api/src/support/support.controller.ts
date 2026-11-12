import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { SupportService } from './support.service.js';

const createSchema = z.object({
  category: z.enum(['ders', 'mali', 'belge', 'genel', 'sikayet']),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  priority: z.enum(['dusuk', 'normal', 'yuksek']).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  status: z.enum(['acik', 'incelemede', 'cozuldu', 'kapali']),
  resolution: z.string().max(4000).optional(),
  assignedUnit: z.string().max(120).optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Get('my')
  @ApiOperation({ summary: 'Aktörün kendi destek talepleri' })
  my() {
    return this.service.my();
  }

  @Post()
  @ApiOperation({ summary: 'Destek talebi oluştur (aktör kullanıcı)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'Tüm destek kuyruğu (personel; ?status filtre, açan email)' })
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Destek talebi güncelle (personel; çözüldü ise resolvedAt=now)' })
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto) {
    return this.service.update(id, body);
  }
}
