import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { StudentFileService } from './student-file.service.js';

const leaveSchema = z.object({
  type: z.string().min(1).max(120),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  decisionNo: z.string().max(120).optional(),
  decisionDate: z.string().date().optional(),
  reason: z.string().max(2000).optional(),
});
type LeaveDto = z.infer<typeof leaveSchema>;

const militarySchema = z.object({
  status: z.string().min(1).max(120),
  deferralDate: z.string().date().optional(),
  note: z.string().max(2000).optional(),
});
type MilitaryDto = z.infer<typeof militarySchema>;

const documentSchema = z.object({
  kind: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  docNo: z.string().max(120).optional(),
  receivedOn: z.string().date().optional(),
  hasOriginal: z.boolean().optional(),
});
type DocumentDto = z.infer<typeof documentSchema>;

const priorEducationSchema = z.object({
  schoolName: z.string().min(1).max(255),
  degree: z.string().max(120).optional(),
  graduationYear: z.number().int().min(1900).max(2200).optional(),
  gpa: z.number().min(0).max(100).optional(),
  note: z.string().max(2000).optional(),
});
type PriorEducationDto = z.infer<typeof priorEducationSchema>;

const awardSchema = z.object({
  title: z.string().min(1).max(255),
  awardDate: z.string().date().optional(),
  description: z.string().max(2000).optional(),
});
type AwardDto = z.infer<typeof awardSchema>;

@ApiTags('student-file')
@Controller('student-file')
export class StudentFileController {
  constructor(private readonly service: StudentFileService) {}

  @Get(':studentId')
  @ApiOperation({
    summary: 'Öğrenci dosyası (izinler + askerlik + belgeler + önceki öğrenim + ödüller)',
  })
  get(@Param('studentId') studentId: string) {
    return this.service.get(studentId);
  }

  @Post(':studentId/leave')
  @ApiOperation({ summary: 'Öğrenci izni/kaydı oluştur (personel + audit)' })
  createLeave(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(leaveSchema)) body: LeaveDto,
  ) {
    return this.service.createLeave(studentId, body);
  }

  @Post(':studentId/military')
  @ApiOperation({ summary: 'Askerlik erteleme kaydı oluştur (personel + audit)' })
  createMilitary(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(militarySchema)) body: MilitaryDto,
  ) {
    return this.service.createMilitary(studentId, body);
  }

  @Post(':studentId/document')
  @ApiOperation({ summary: 'Öğrenci belgesi kaydı oluştur (personel + audit)' })
  createDocument(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(documentSchema)) body: DocumentDto,
  ) {
    return this.service.createDocument(studentId, body);
  }

  @Post(':studentId/prior-education')
  @ApiOperation({ summary: 'Önceki öğrenim kaydı oluştur (personel + audit)' })
  createPriorEducation(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(priorEducationSchema)) body: PriorEducationDto,
  ) {
    return this.service.createPriorEducation(studentId, body);
  }

  @Post(':studentId/award')
  @ApiOperation({ summary: 'Öğrenci ödül/başarı kaydı oluştur (personel + audit)' })
  createAward(
    @Param('studentId') studentId: string,
    @Body(new ZodValidationPipe(awardSchema)) body: AwardDto,
  ) {
    return this.service.createAward(studentId, body);
  }
}
