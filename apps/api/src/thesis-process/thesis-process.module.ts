import { Module } from '@nestjs/common';
import { ThesisProcessController } from './thesis-process.controller.js';
import { ThesisProcessService } from './thesis-process.service.js';

@Module({
  controllers: [ThesisProcessController],
  providers: [ThesisProcessService],
})
export class ThesisProcessModule {}
