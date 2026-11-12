import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [GradesModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
