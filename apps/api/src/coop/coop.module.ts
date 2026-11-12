import { Module } from '@nestjs/common';
import { CoopController } from './coop.controller.js';
import { CoopService } from './coop.service.js';

@Module({
  controllers: [CoopController],
  providers: [CoopService],
})
export class CoopModule {}
