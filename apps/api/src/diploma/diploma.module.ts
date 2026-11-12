import { Module } from '@nestjs/common';
import { DiplomaController } from './diploma.controller.js';
import { DiplomaService } from './diploma.service.js';

@Module({
  controllers: [DiplomaController],
  providers: [DiplomaService],
})
export class DiplomaModule {}
