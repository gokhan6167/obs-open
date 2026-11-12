import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service.js';

/**
 * Mali veri sahibi finance modülünde olduğu için /reports/finance-summary ucu
 * burada tanımlı (route base 'reports', reports modülüyle çakışmaz — farklı yol).
 * Böylece çakışma-önleme kuralı gereği yalnızca finance dosyaları değişir.
 */
@ApiTags('reports')
@Controller('reports')
export class FinanceReportsController {
  constructor(private readonly finance: FinanceService) {}

  @Get('finance-summary')
  @ApiOperation({
    summary: 'Finansal toplulaştırma: tahakkuk/tahsilat/açık-alacak + dağılımlar (?termId)',
  })
  financeSummary(@Query('termId') termId?: string) {
    return this.finance.financeSummary(termId);
  }
}
