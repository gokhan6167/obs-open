import { Module } from '@nestjs/common';
import { AdaptationController } from './adaptation.controller.js';
import { AdaptationService } from './adaptation.service.js';

@Module({
  controllers: [AdaptationController],
  providers: [AdaptationService],
})
export class AdaptationModule {}
