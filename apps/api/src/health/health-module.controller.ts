import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { HealthService } from './health.service.js';

const planSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  startsOn: z.string(),
});
type PlanDto = z.infer<typeof planSchema>;

const committeeYearSchema = z.object({
  termId: z.string().uuid(),
  generalExamScore: z.number(),
  committeesWeightInYear: z.number(),
  generalExamWeightInYear: z.number(),
  passingThreshold: z.number(),
});
type CommitteeYearDto = z.infer<typeof committeeYearSchema>;

const internshipSchema = z.object({
  studentId: z.string().uuid(),
  clinicalSiteId: z.string().uuid(),
  startsOn: z.string(),
  endsOn: z.string(),
});
type InternshipDto = z.infer<typeof internshipSchema>;

@ApiTags('health')
@Controller('health-module')
export class HealthModuleController {
  constructor(private readonly service: HealthService) {}

  @Post('rotations/:id/plan')
  @ApiOperation({ summary: 'Grup bazlı dönüşümlü rotasyon planı üret' })
  plan(@Param('id') id: string, @Body(new ZodValidationPipe(planSchema)) body: PlanDto) {
    return this.service.generateRotationPlan(id, body.studentIds, body.startsOn);
  }

  @Post('students/:id/committee-year')
  @ApiOperation({ summary: 'Kurul (komite) yıl notu hesapla' })
  committeeYear(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(committeeYearSchema)) body: CommitteeYearDto,
  ) {
    return this.service.computeCommitteeYearForStudent(id, body.termId, {
      generalExamScore: body.generalExamScore,
      committeesWeightInYear: body.committeesWeightInYear,
      generalExamWeightInYear: body.generalExamWeightInYear,
      passingThreshold: body.passingThreshold,
    });
  }

  @Post('internships')
  @ApiOperation({ summary: 'Staj/intörnlük kaydı oluştur' })
  createInternship(@Body(new ZodValidationPipe(internshipSchema)) body: InternshipDto) {
    return this.service.createInternship(
      body.studentId,
      body.clinicalSiteId,
      body.startsOn,
      body.endsOn,
    );
  }

  @Post('internships/:id/approve-logbook')
  @ApiOperation({ summary: 'Staj defteri onayı' })
  async approveLogbook(@Param('id') id: string) {
    await this.service.approveLogbook(id);
    return { ok: true };
  }

  @Post('sgk/generate')
  @ApiOperation({ summary: 'SGK staj giriş bildirimi verisi üret (mock adaptör)' })
  sgk() {
    return this.service.generateSgkData();
  }
}
