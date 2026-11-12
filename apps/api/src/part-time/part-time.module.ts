import { Module } from '@nestjs/common';
import { PartTimeController } from './part-time.controller.js';
import { PartTimeService } from './part-time.service.js';

@Module({
  controllers: [PartTimeController],
  providers: [PartTimeService],
})
export class PartTimeModule {}
