import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [GradesModule], // GpaService (GNO hesabı)
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
