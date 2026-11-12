import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { StudentsService } from './students.service.js';

const changeStatusSchema = z.object({
  to: z.enum([
    'aktif',
    'kayit_dondurma',
    'pasif',
    'iliskigi_kesildi',
    'mezun',
    'azami_sure_doldu',
    'af_ogrencisi',
  ]),
  reason: z.string().max(500).optional(),
});
type ChangeStatusDto = z.infer<typeof changeStatusSchema>;

const setAdvisorSchema = z.object({
  advisorUserId: z.string().uuid(),
});
type SetAdvisorDto = z.infer<typeof setAdvisorSchema>;

const bulkAdvisorSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  advisorUserId: z.string().uuid(),
});
type BulkAdvisorDto = z.infer<typeof bulkAdvisorSchema>;

const promoteSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  mode: z.enum(['class', 'term']),
});
type PromoteDto = z.infer<typeof promoteSchema>;

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get('advisors')
  @ApiOperation({ summary: 'Danışman olabilecek personel (öğretim elemanı/danışman rollü)' })
  advisors() {
    return this.service.advisorCandidates();
  }

  @Get(':id/academic-summary')
  @ApiOperation({ summary: 'Öğrenci akademik özet kartı (GNO/AKTS/azami süre/son notlar)' })
  academicSummary(@Param('id') id: string) {
    return this.service.academicSummary(id);
  }

  @Get(':id/overview')
  @ApiOperation({ summary: 'Öğrenci 360 özeti (profil + program + akademik + mali)' })
  overview(@Param('id') id: string) {
    return this.service.overview(id);
  }

  @Get(':id/grades')
  @ApiOperation({ summary: 'Öğrenci not dökümü (personel transkript özeti) + GNO' })
  grades(@Param('id') id: string) {
    return this.service.studentGrades(id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Öğrenci durum/işlem zaman çizelgesi (audit)' })
  timeline(@Param('id') id: string) {
    return this.service.timeline(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Öğrenci getir (zengin: program/kayıt/sınıf/danışman/dönem yükü)' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'Öğrenci durumunu geçişle değiştir (durum makinesi + RBAC + audit)',
  })
  changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusDto,
  ) {
    return this.service.changeStatus(id, body.to, body.reason);
  }

  @Post('advisor/bulk')
  @ApiOperation({ summary: 'Toplu danışman ataması (studentIds -> advisorUserId)' })
  bulkAdvisor(@Body(new ZodValidationPipe(bulkAdvisorSchema)) body: BulkAdvisorDto) {
    return this.service.bulkSetAdvisor(body.studentIds, body.advisorUserId);
  }

  @Post('promote')
  @ApiOperation({ summary: 'Toplu sınıf/dönem atlatma (mode: class|term)' })
  promote(@Body(new ZodValidationPipe(promoteSchema)) body: PromoteDto) {
    return this.service.promote(body.studentIds, body.mode);
  }

  @Post(':id/advisor')
  @ApiOperation({ summary: 'Öğrenciye danışman ata (advisorUserId)' })
  setAdvisor(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setAdvisorSchema)) body: SetAdvisorDto,
  ) {
    return this.service.setAdvisor(id, body.advisorUserId);
  }
}
