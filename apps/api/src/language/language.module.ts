import { Module } from '@nestjs/common';
import { LanguageController } from './language.controller.js';
import { LanguageService } from './language.service.js';

@Module({
  controllers: [LanguageController],
  providers: [LanguageService],
})
export class LanguageModule {}
