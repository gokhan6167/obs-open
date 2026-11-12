import { Module } from '@nestjs/common';
import { StudentRequestController } from './student-request.controller.js';
import { StudentRequestService } from './student-request.service.js';

@Module({
  controllers: [StudentRequestController],
  providers: [StudentRequestService],
})
export class StudentRequestModule {}
