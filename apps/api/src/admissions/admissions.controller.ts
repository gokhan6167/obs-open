import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AdmissionsService } from './admissions.service.js';

const createProgramSchema = z.object({
  programId: z.string().uuid(),
  type: z.string().min(1).max(120),
  year: z.number().int(),
  term: z.string().max(120).optional(),
  quota: z.number().int().min(0),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  minGpa: z.number().min(0).optional(),
});
type CreateProgramDto = z.infer<typeof createProgramSchema>;

const createApplicantSchema = z.object({
  applicationProgramId: z.string().uuid(),
  fullName: z.string().min(1).max(240),
  nationalId: z.string().max(20).optional(),
  score: z.number().optional(),
});
type CreateApplicantDto = z.infer<typeof createApplicantSchema>;

const updateStatusSchema = z.object({
  status: z.enum(['basvurdu', 'kazandi', 'kazanamadi', 'kesin_kayit']),
});
type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

@ApiTags('admissions')
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly service: AdmissionsService) {}

  @Get('programs')
  @ApiOperation({ summary: 'Başvuru programları (program adı join + başvuran sayısı)' })
  listPrograms() {
    return this.service.listPrograms();
  }

  @Post('programs')
  @ApiOperation({ summary: 'Başvuru programı oluştur (personel + audit)' })
  createProgram(@Body(new ZodValidationPipe(createProgramSchema)) body: CreateProgramDto) {
    return this.service.createProgram(body);
  }

  @Get('applicants')
  @ApiOperation({ summary: 'Başvuranlar (opsiyonel ?applicationProgramId filtresi)' })
  listApplicants(@Query('applicationProgramId') applicationProgramId?: string) {
    return this.service.listApplicants(applicationProgramId);
  }

  @Post('applicants')
  @ApiOperation({ summary: 'Başvuran oluştur (personel + audit)' })
  createApplicant(@Body(new ZodValidationPipe(createApplicantSchema)) body: CreateApplicantDto) {
    return this.service.createApplicant(body);
  }

  @Patch('applicants/:id')
  @ApiOperation({ summary: 'Başvuran durumunu güncelle (personel + audit)' })
  updateApplicantStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: UpdateStatusDto,
  ) {
    return this.service.updateApplicantStatus(id, body.status);
  }
}
