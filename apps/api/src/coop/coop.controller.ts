import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CoopService } from './coop.service.js';

const companySchema = z.object({
  name: z.string().min(1).max(200),
  sector: z.string().max(120).optional(),
  contact: z.string().max(300).optional(),
  protocolNo: z.string().max(120).optional(),
  scholarshipRateBps: z.number().int().min(0).max(10000).optional(),
});
type CompanyDto = z.infer<typeof companySchema>;

const applySchema = z.object({
  companyId: z.string().uuid(),
  term: z.string().max(40).optional(),
});
type ApplyDto = z.infer<typeof applySchema>;

const updatePlacementSchema = z.object({
  status: z.enum(['short_list', 'kabul', 'devam', 'tamamlandi', 'red']),
  note: z.string().max(2000).optional(),
});
type UpdatePlacementDto = z.infer<typeof updatePlacementSchema>;

@ApiTags('coop')
@Controller('coop')
export class CoopController {
  constructor(private readonly service: CoopService) {}

  @Get('companies')
  @ApiOperation({ summary: 'CO-OP firmaları + yerleştirme sayısı' })
  companies() {
    return this.service.companies();
  }

  @Post('companies')
  @ApiOperation({ summary: 'CO-OP firma/protokol tanımla (personel)' })
  createCompany(@Body(new ZodValidationPipe(companySchema)) body: CompanyDto) {
    return this.service.createCompany(body);
  }

  @Get('placements')
  @ApiOperation({ summary: 'CO-OP yerleştirme kuyruğu (personel; ?companyId,?status)' })
  placements(@Query('companyId') companyId?: string, @Query('status') status?: string) {
    return this.service.placements(companyId, status);
  }

  @Get('placements/my')
  @ApiOperation({ summary: 'Aktör öğrencinin CO-OP başvuruları' })
  myPlacements() {
    return this.service.myPlacements();
  }

  @Post('placements')
  @ApiOperation({ summary: 'CO-OP başvurusu (aktör öğrenci; status=başvuruldu)' })
  apply(@Body(new ZodValidationPipe(applySchema)) body: ApplyDto) {
    return this.service.apply(body);
  }

  @Patch('placements/:id')
  @ApiOperation({ summary: 'Yerleştirme durumu güncelle (personel)' })
  updatePlacement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlacementSchema)) body: UpdatePlacementDto,
  ) {
    return this.service.updatePlacement(id, body);
  }
}
