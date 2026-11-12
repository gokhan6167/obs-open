import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service.js';
import { GpaService } from './gpa.service.js';
import { GradesController } from './grades.controller.js';
import { GradesService } from './grades.service.js';

@Module({
  controllers: [GradesController],
  providers: [GradesService, GpaService, ExcelService],
  exports: [GpaService],
})
export class GradesModule {}
