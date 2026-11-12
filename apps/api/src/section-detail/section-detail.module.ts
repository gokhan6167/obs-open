import { Module } from '@nestjs/common';
import { SectionDetailController } from './section-detail.controller.js';
import { SectionDetailService } from './section-detail.service.js';

@Module({
  controllers: [SectionDetailController],
  providers: [SectionDetailService],
})
export class SectionDetailModule {}
