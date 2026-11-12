import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module.js';
import { GradesModule } from '../grades/grades.module.js';
import { EnrollmentAdminController } from './enrollment-admin.controller.js';
import { EnrollmentController } from './enrollment.controller.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({
  // GradesModule -> GpaService (AKTS tavanında GNO-bazlı boost için). Parametre
  // servisi (@Global) enjekte edilebilir.
  imports: [CalendarModule, GradesModule],
  controllers: [EnrollmentController, EnrollmentAdminController],
  providers: [EnrollmentService],
})
export class EnrollmentModule {}
