import { Module } from '@nestjs/common';
import { ThesisController } from './thesis.controller.js';
import { ThesisService } from './thesis.service.js';

@Module({
  controllers: [ThesisController],
  providers: [ThesisService],
})
export class ThesisModule {}
