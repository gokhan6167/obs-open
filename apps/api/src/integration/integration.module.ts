import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller.js';
import { IntegrationService } from './integration.service.js';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService],
})
export class IntegrationModule {}
