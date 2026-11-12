import { Module } from '@nestjs/common';
import { ElectivePoolController } from './elective-pool.controller.js';
import { ElectivePoolService } from './elective-pool.service.js';

@Module({
  controllers: [ElectivePoolController],
  providers: [ElectivePoolService],
})
export class ElectivePoolModule {}
