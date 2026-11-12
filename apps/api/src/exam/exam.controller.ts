import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ExamService } from './exam.service.js';

const createScheduleSchema = z.object({
  sectionId: z.string().uuid(),
  examType: z.string().min(1).max(120),
  examDate: z.string().date().optional(),
  startTime: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});
type CreateScheduleDto = z.infer<typeof createScheduleSchema>;

const createMakeupSchema = z.object({
  studentId: z.string().uuid(),
  sectionId: z.string().uuid(),
  examType: z.string().min(1).max(120),
  decisionNo: z.string().max(120).optional(),
});
type CreateMakeupDto = z.infer<typeof createMakeupSchema>;

@ApiTags('exam')
@Controller('exam')
export class ExamController {
  constructor(private readonly service: ExamService) {}

  @Get('schedules')
  @ApiOperation({ summary: 'Sınav programı listesi (opsiyonel ?sectionId; ders/şube adı)' })
  listSchedules(@Query('sectionId') sectionId?: string) {
    return this.service.listSchedules(sectionId);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Sınav programı oluştur (personel + audit)' })
  createSchedule(@Body(new ZodValidationPipe(createScheduleSchema)) body: CreateScheduleDto) {
    return this.service.createSchedule(body);
  }

  @Get('makeups')
  @ApiOperation({ summary: 'Mazeret sınavları listesi (öğrenci adı/no)' })
  listMakeups() {
    return this.service.listMakeups();
  }

  @Post('makeups')
  @ApiOperation({ summary: 'Mazeret sınavı oluştur (personel + audit)' })
  createMakeup(@Body(new ZodValidationPipe(createMakeupSchema)) body: CreateMakeupDto) {
    return this.service.createMakeup(body);
  }
}
