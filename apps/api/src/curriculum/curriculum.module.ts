import { Module } from '@nestjs/common';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';

@Module({
  controllers: [CurriculumController],
  providers: [CurriculumService],
})
export class CurriculumModule {}
