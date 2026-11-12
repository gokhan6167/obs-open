import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { InternationalService } from './international.service.js';

const createSchema = z.object({
  applicantId: z.string().uuid(),
  country: z.string().min(1).max(120).optional(),
  depositAmount: z.number().int().min(0).optional(),
  note: z.string().max(2000).optional(),
});
type CreateDto = z.infer<typeof createSchema>;

const updateSchema = z.object({
  depositPaid: z.boolean().optional(),
  visaStatus: z.enum(['beklemede', 'basvuruldu', 'alindi', 'red']).optional(),
  status: z.enum(['on_kabul', 'kabul', 'kayit', 'iptal']).optional(),
  acceptanceLetterNo: z.string().min(1).max(120).optional(),
  note: z.string().max(2000).optional(),
});
type UpdateDto = z.infer<typeof updateSchema>;

@ApiTags('international')
@Controller('international')
export class InternationalController {
  constructor(private readonly service: InternationalService) {}

  @Get()
  @ApiOperation({ summary: 'Uluslararası kabul kayıtları (aday adı + program join)' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Uluslararası kabul kaydı oluştur (personel + audit)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Uluslararası kabul kaydını güncelle (depozito ödenmeden belge no verilemez)',
  })
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateDto) {
    return this.service.update(id, body);
  }

  @Post(':id/acceptance-letter')
  @ApiOperation({ summary: 'Resmi kabul belgesi düzenle (depozito ödendiyse otomatik belge no)' })
  issueAcceptanceLetter(@Param('id') id: string) {
    return this.service.issueAcceptanceLetter(id);
  }
}
