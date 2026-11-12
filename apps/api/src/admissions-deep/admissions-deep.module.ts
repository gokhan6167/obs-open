import { Module } from '@nestjs/common';
import { AdmissionsDeepController } from './admissions-deep.controller.js';
import { AdmissionsDeepService } from './admissions-deep.service.js';

@Module({
  controllers: [AdmissionsDeepController],
  providers: [AdmissionsDeepService],
})
export class AdmissionsDeepModule {}
