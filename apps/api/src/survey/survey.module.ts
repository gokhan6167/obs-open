import { Module } from '@nestjs/common';
import { SurveyController } from './survey.controller.js';
import { SurveyService } from './survey.service.js';

@Module({
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule {}
