import { Module } from '@nestjs/common';
import { DisciplineController } from './discipline.controller.js';
import { DisciplineService } from './discipline.service.js';

@Module({
  controllers: [DisciplineController],
  providers: [DisciplineService],
})
export class DisciplineModule {}
