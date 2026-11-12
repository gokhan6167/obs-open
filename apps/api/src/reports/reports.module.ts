import { Module } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { ReportsController } from './reports.controller.js';
import { MockYoksisProvider, YOKSIS_PROVIDER } from './yoksis.provider.js';
import { YoksisService } from './yoksis.service.js';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportService,
    YoksisService,
    // YÖKSİS adaptörü: mock. Gerçek web servis sonradan burada değişir.
    { provide: YOKSIS_PROVIDER, useClass: MockYoksisProvider },
  ],
})
export class ReportsModule {}
