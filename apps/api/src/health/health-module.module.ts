import { Module } from '@nestjs/common';
import { HealthModuleController } from './health-module.controller.js';
import { HealthService } from './health.service.js';
import { MockSgkProvider, SGK_PROVIDER } from './sgk.provider.js';

/** Sağlık programları modülü (M7). Not: /health (sistem sağlığı) ayrı controller. */
@Module({
  controllers: [HealthModuleController],
  providers: [
    HealthService,
    // SGK adaptörü: mock. Gerçek SGK bildirimi sonradan burada değişir.
    { provide: SGK_PROVIDER, useClass: MockSgkProvider },
  ],
})
export class HealthDomainModule {}
