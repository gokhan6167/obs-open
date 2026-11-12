import { Module } from '@nestjs/common';
import { WellbeingController } from './wellbeing.controller.js';
import { WellbeingService } from './wellbeing.service.js';

@Module({
  controllers: [WellbeingController],
  providers: [WellbeingService],
})
export class WellbeingModule {}
