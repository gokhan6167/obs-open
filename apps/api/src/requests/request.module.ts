import { Module } from '@nestjs/common';
import { RequestController } from './request.controller.js';
import { RequestService } from './request.service.js';

@Module({
  controllers: [RequestController],
  providers: [RequestService],
})
export class RequestModule {}
