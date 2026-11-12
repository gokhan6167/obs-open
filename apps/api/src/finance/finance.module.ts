import { Module } from '@nestjs/common';
import { FinanceReportsController } from './finance-reports.controller.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { MockPaymentProvider, PAYMENT_PROVIDER } from './payment.provider.js';
import { PaymentService } from './payment.service.js';

@Module({
  controllers: [FinanceController, FinanceReportsController],
  providers: [
    FinanceService,
    PaymentService,
    // vPOS adaptörü: mock. Gerçek iyzico/banka vPOS sonradan burada değişir.
    { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
  ],
})
export class FinanceModule {}
