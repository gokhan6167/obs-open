import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CampusService } from './campus.service.js';

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  eventDate: z.string().date().optional(),
  location: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});
type CreateEventDto = z.infer<typeof createEventSchema>;

const attendanceSchema = z.object({
  studentId: z.string().uuid(),
  attended: z.boolean().optional(),
  feedback: z.number().int().min(1).max(5).optional(),
});
type AttendanceDto = z.infer<typeof attendanceSchema>;

const createLoanSchema = z.object({
  studentId: z.string().uuid(),
  itemTitle: z.string().min(1).max(300),
  loanedOn: z.string().date().optional(),
  dueOn: z.string().date().optional(),
});
type CreateLoanDto = z.infer<typeof createLoanSchema>;

const updateLoanSchema = z.object({
  returnedOn: z.string().date().optional(),
  fineAmount: z.number().int().min(0).optional(),
  status: z.enum(['odunc', 'iade', 'gecikmis', 'kayip']).optional(),
});
type UpdateLoanDto = z.infer<typeof updateLoanSchema>;

@ApiTags('campus')
@Controller('campus')
export class CampusController {
  constructor(private readonly service: CampusService) {}

  @Get('orientation')
  @ApiOperation({ summary: 'Oryantasyon etkinlikleri + katılımcı sayısı' })
  listEvents() {
    return this.service.listEvents();
  }

  @Post('orientation')
  @ApiOperation({ summary: 'Oryantasyon etkinliği oluştur (personel)' })
  createEvent(@Body(new ZodValidationPipe(createEventSchema)) body: CreateEventDto) {
    return this.service.createEvent(body);
  }

  @Get('orientation/:id/attendance')
  @ApiOperation({ summary: 'Etkinlik katılım listesi (öğrenci no/ad)' })
  attendance(@Param('id') id: string) {
    return this.service.attendance(id);
  }

  @Post('orientation/:id/attendance')
  @ApiOperation({ summary: 'Katılım kaydet (personel; aynı öğrenci varsa günceller)' })
  markAttendance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attendanceSchema)) body: AttendanceDto,
  ) {
    return this.service.markAttendance(id, body);
  }

  @Get('library')
  @ApiOperation({ summary: 'Kütüphane ödünç kayıtları (personel; ?status, ?studentId)' })
  listLoans(@Query('status') status?: string, @Query('studentId') studentId?: string) {
    return this.service.listLoans(status, studentId);
  }

  @Get('library/my')
  @ApiOperation({ summary: 'Aktör öğrencinin ödünç kayıtları' })
  myLoans() {
    return this.service.myLoans();
  }

  @Post('library')
  @ApiOperation({ summary: 'Ödünç kaydı oluştur (personel)' })
  createLoan(@Body(new ZodValidationPipe(createLoanSchema)) body: CreateLoanDto) {
    return this.service.createLoan(body);
  }

  @Get('library/debt/:studentId')
  @ApiOperation({ summary: 'Öğrencinin ödenmemiş ceza toplamı + gecikmiş kitap sayısı' })
  debt(@Param('studentId') studentId: string) {
    return this.service.debt(studentId);
  }

  @Patch('library/:id')
  @ApiOperation({ summary: 'Ödünç kaydı güncelle (personel; iade/ceza)' })
  updateLoan(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLoanSchema)) body: UpdateLoanDto,
  ) {
    return this.service.updateLoan(id, body);
  }
}
