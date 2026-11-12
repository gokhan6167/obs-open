import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { SectionDetailService } from './section-detail.service.js';

const createMeetingSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(7).optional(),
  startTime: z.string().max(20).optional(),
  endTime: z.string().max(20).optional(),
  kind: z.string().min(1).max(60),
  classroomId: z.string().uuid().optional(),
  instructorUserId: z.string().uuid().optional(),
  isMakeup: z.boolean().optional(),
  ykkNo: z.string().max(120).optional(),
  weekNo: z.number().int().min(1).max(60).optional(),
  note: z.string().max(1000).optional(),
});
type CreateMeetingDto = z.infer<typeof createMeetingSchema>;

const createInstructorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['sorumlu', 'veren']),
});
type CreateInstructorDto = z.infer<typeof createInstructorSchema>;

@ApiTags('section-detail')
@Controller('section-detail')
export class SectionDetailController {
  constructor(private readonly service: SectionDetailService) {}

  @Get(':sectionId')
  @ApiOperation({ summary: 'Ders açma detayı: haftalık program (derslik adı) + hoca atamaları (email)' })
  get(@Param('sectionId') sectionId: string) {
    return this.service.get(sectionId);
  }

  @Post(':sectionId/meeting')
  @ApiOperation({ summary: 'Haftalık program satırı ekle (personel)' })
  createMeeting(
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(createMeetingSchema)) body: CreateMeetingDto,
  ) {
    return this.service.createMeeting(sectionId, body);
  }

  @Post(':sectionId/instructor')
  @ApiOperation({ summary: 'Öğretim elemanı ata (personel)' })
  createInstructor(
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(createInstructorSchema)) body: CreateInstructorDto,
  ) {
    return this.service.createInstructor(sectionId, body);
  }

  @Delete('meeting/:id')
  @ApiOperation({ summary: 'Haftalık program satırını sil (personel)' })
  deleteMeeting(@Param('id') id: string) {
    return this.service.deleteMeeting(id);
  }
}
