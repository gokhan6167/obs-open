import { Module } from '@nestjs/common';
import { InternshipController } from './internship.controller.js';
import { InternshipService } from './internship.service.js';

@Module({
  controllers: [InternshipController],
  providers: [InternshipService],
})
export class InternshipModule {}
