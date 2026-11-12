import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ThesisProcessService } from './thesis-process.service.js';

const committeeSchema = z.object({
  memberUserId: z.string().uuid().optional(),
  memberName: z.string().min(1).max(200).optional(),
  role: z.enum(['danisman', 'uye', 'baskan']),
});
type CommitteeDto = z.infer<typeof committeeSchema>;

const progressSchema = z.object({
  period: z.string().min(1).max(60),
  meetingDate: z.string().date().optional(),
  result: z.enum(['basarili', 'basarisiz', 'beklemede']),
  note: z.string().max(2000).optional(),
});
type ProgressDto = z.infer<typeof progressSchema>;

const plagiarismSchema = z.object({
  similarityPct: z.number().min(0).max(100),
  thresholdPct: z.number().min(0).max(100).optional(),
  // Yalnızca http(s): javascript:/data: şemaları anchor href'inde XSS'e yol açar.
  reportUrl: z
    .string()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), { message: 'reportUrl http(s) ile başlamalı' })
    .optional(),
});
type PlagiarismDto = z.infer<typeof plagiarismSchema>;

const defenseSchema = z.object({
  defenseDate: z.string().date(),
  location: z.string().max(200).optional(),
  jury: z.array(z.unknown()).max(20).optional(),
  decisionNo: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
});
type DefenseDto = z.infer<typeof defenseSchema>;

const defenseResultSchema = z.object({
  result: z.enum(['basarili', 'duzeltme', 'red']),
  note: z.string().max(2000).optional(),
});
type DefenseResultDto = z.infer<typeof defenseResultSchema>;

const qualificationSchema = z.object({
  studentId: z.string().uuid(),
  examDate: z.string().date().optional(),
  writtenScore: z.number().min(0).max(100).optional(),
  oralScore: z.number().min(0).max(100).optional(),
  jury: z.array(z.unknown()).max(20).optional(),
  note: z.string().max(2000).optional(),
});
type QualificationDto = z.infer<typeof qualificationSchema>;

@ApiTags('thesis-process')
@Controller('thesis-process')
export class ThesisProcessController {
  constructor(private readonly service: ThesisProcessService) {}

  @Get('qualification')
  @ApiOperation({ summary: 'Yeterlilik sınavı kayıtları (personel; ?studentId filtresi)' })
  qualifications(@Query('studentId') studentId?: string) {
    return this.service.qualifications(studentId);
  }

  @Post('qualification')
  @ApiOperation({ summary: 'Yeterlilik sınavı kaydı (deneme no + sonuç otomatik)' })
  createQualification(
    @Body(new ZodValidationPipe(qualificationSchema)) body: QualificationDto,
  ) {
    return this.service.createQualification(body);
  }

  @Patch('defense/:id')
  @ApiOperation({ summary: 'Savunma sonucu (başarılı/düzeltme/red)' })
  decideDefense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(defenseResultSchema)) body: DefenseResultDto,
  ) {
    return this.service.decideDefense(id, body);
  }

  @Get(':thesisId')
  @ApiOperation({ summary: 'Tezin tüm süreci (TİK/izleme/intihal/savunma; sahibi öğrenci veya personel)' })
  detail(@Param('thesisId') thesisId: string) {
    return this.service.detail(thesisId);
  }

  @Post(':thesisId/committee')
  @ApiOperation({ summary: 'TİK üyesi ekle (danışman/üye/başkan)' })
  addCommittee(
    @Param('thesisId') thesisId: string,
    @Body(new ZodValidationPipe(committeeSchema)) body: CommitteeDto,
  ) {
    return this.service.addCommittee(thesisId, body);
  }

  @Post(':thesisId/progress')
  @ApiOperation({ summary: 'TİK izleme raporu ekle' })
  addProgress(
    @Param('thesisId') thesisId: string,
    @Body(new ZodValidationPipe(progressSchema)) body: ProgressDto,
  ) {
    return this.service.addProgress(thesisId, body);
  }

  @Post(':thesisId/plagiarism')
  @ApiOperation({ summary: 'İntihal raporu ekle (geçti/kaldı eşikten otomatik)' })
  addPlagiarism(
    @Param('thesisId') thesisId: string,
    @Body(new ZodValidationPipe(plagiarismSchema)) body: PlagiarismDto,
  ) {
    return this.service.addPlagiarism(thesisId, body);
  }

  @Post(':thesisId/defense')
  @ApiOperation({ summary: 'Savunma planla (intihal raporu geçmiş olmalı)' })
  planDefense(
    @Param('thesisId') thesisId: string,
    @Body(new ZodValidationPipe(defenseSchema)) body: DefenseDto,
  ) {
    return this.service.planDefense(thesisId, body);
  }
}
