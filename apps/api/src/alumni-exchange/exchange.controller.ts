import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ExchangeService } from './exchange.service.js';

const createSchema = z.object({
  program: z.enum(['erasmus', 'farabi', 'mevlana']),
  direction: z.enum(['giden', 'gelen']),
  partnerUniversity: z.string().max(200).optional(),
  term: z.string().max(120).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  status: z.enum(['kabul', 'tamamlandi', 'iptal']),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('exchange')
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly service: ExchangeService) {}

  @Get()
  @ApiOperation({ summary: 'Tüm değişim hareketliliği (personel; öğrenci ad/no)' })
  list() {
    return this.service.list();
  }

  @Get('my')
  @ApiOperation({ summary: 'Aktör öğrencinin kendi değişim başvuruları' })
  listMine() {
    return this.service.listMine();
  }

  @Post()
  @ApiOperation({ summary: 'Değişim başvurusu oluştur (aktör öğrenci başvurur)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Başvuru durumunu güncelle (personel: kabul/tamamlandi/iptal)' })
  updateStatus(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto) {
    return this.service.updateStatus(id, body.status);
  }
}
