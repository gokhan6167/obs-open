import { Module } from '@nestjs/common';
import { AcademicWeeksController } from './academic-weeks.controller.js';
import { AcademicWeeksService } from './academic-weeks.service.js';

@Module({
  controllers: [AcademicWeeksController],
  providers: [AcademicWeeksService],
})
export class AcademicWeeksModule {}
