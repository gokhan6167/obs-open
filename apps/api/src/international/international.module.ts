import { Module } from '@nestjs/common';
import { InternationalController } from './international.controller.js';
import { InternationalService } from './international.service.js';

@Module({
  controllers: [InternationalController],
  providers: [InternationalService],
})
export class InternationalModule {}
