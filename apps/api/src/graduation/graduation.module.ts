import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module.js';
import { GraduationController } from './graduation.controller.js';
import { GraduationService } from './graduation.service.js';

@Module({
  imports: [GradesModule], // GpaService
  controllers: [GraduationController],
  providers: [GraduationService],
})
export class GraduationModule {}
