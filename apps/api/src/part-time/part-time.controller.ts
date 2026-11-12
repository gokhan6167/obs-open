import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { PartTimeService } from './part-time.service.js';

const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  unit: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  hourlyRate: z.number().int().min(0).optional(),
  quota: z.number().int().min(0).max(9999).optional(),
});
type CreateJobDto = z.infer<typeof createJobSchema>;

const updateJobSchema = z.object({
  status: z.enum(['acik', 'kapali']),
});
type UpdateJobDto = z.infer<typeof updateJobSchema>;

const updateAssignmentSchema = z.object({
  status: z.enum(['kabul', 'devam', 'bitti', 'red']).optional(),
  startedOn: z.string().date().optional(),
  endedOn: z.string().date().optional(),
});
type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;

const createTimesheetSchema = z.object({
  period: z.string().min(1).max(40),
  hours: z.number().min(0).max(9999),
});
type CreateTimesheetDto = z.infer<typeof createTimesheetSchema>;

const approveTimesheetSchema = z.object({
  approved: z.boolean(),
});
type ApproveTimesheetDto = z.infer<typeof approveTimesheetSchema>;

@ApiTags('part-time')
@Controller('part-time')
export class PartTimeController {
  constructor(private readonly service: PartTimeService) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Kısmi zamanlı ilanlar + başvuru sayısı' })
  listJobs() {
    return this.service.listJobs();
  }

  @Post('jobs')
  @ApiOperation({ summary: 'İlan oluştur (personel)' })
  createJob(@Body(new ZodValidationPipe(createJobSchema)) body: CreateJobDto) {
    return this.service.createJob(body);
  }

  @Patch('jobs/:id')
  @ApiOperation({ summary: 'İlan durumu güncelle (personel; acik/kapali)' })
  updateJob(@Param('id') id: string, @Body(new ZodValidationPipe(updateJobSchema)) body: UpdateJobDto) {
    return this.service.updateJob(id, body);
  }

  @Post('jobs/:id/apply')
  @ApiOperation({ summary: 'Aktör öğrenci ilana başvurur (kapalı ilan/ikinci başvuru 409)' })
  apply(@Param('id') id: string) {
    return this.service.apply(id);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Atama kuyruğu (personel; ?jobId, ?status; öğrenci + ilan adı)' })
  listAssignments(@Query('jobId') jobId?: string, @Query('status') status?: string) {
    return this.service.listAssignments(jobId, status);
  }

  @Get('assignments/my')
  @ApiOperation({ summary: 'Aktör öğrencinin atamaları' })
  myAssignments() {
    return this.service.myAssignments();
  }

  @Patch('assignments/:id')
  @ApiOperation({ summary: 'Atama güncelle (personel; kabul/devam/bitti/red)' })
  updateAssignment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) body: UpdateAssignmentDto,
  ) {
    return this.service.updateAssignment(id, body);
  }

  @Get('assignments/:id/timesheets')
  @ApiOperation({ summary: 'Atamanın puantajları (onaylıda ücret hesabı)' })
  timesheets(@Param('id') id: string) {
    return this.service.timesheets(id);
  }

  @Post('assignments/:id/timesheets')
  @ApiOperation({ summary: 'Puantaj ekle (personel veya atamanın öğrencisi)' })
  createTimesheet(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTimesheetSchema)) body: CreateTimesheetDto,
  ) {
    return this.service.createTimesheet(id, body);
  }

  @Patch('timesheets/:id')
  @ApiOperation({ summary: 'Puantaj onayla (personel; ücret = saat × saatlik ücret)' })
  approveTimesheet(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveTimesheetSchema)) body: ApproveTimesheetDto,
  ) {
    return this.service.approveTimesheet(id, body.approved);
  }
}
