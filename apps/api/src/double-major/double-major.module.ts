import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module.js';
import { DoubleMajorController } from './double-major.controller.js';
import { DoubleMajorService } from './double-major.service.js';

@Module({
  imports: [GradesModule], // GpaService
  controllers: [DoubleMajorController],
  providers: [DoubleMajorService],
})
export class DoubleMajorModule {}
