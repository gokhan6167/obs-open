import { Module } from '@nestjs/common';
import { StudentFileController } from './student-file.controller.js';
import { StudentFileService } from './student-file.service.js';

@Module({
  controllers: [StudentFileController],
  providers: [StudentFileService],
})
export class StudentFileModule {}
