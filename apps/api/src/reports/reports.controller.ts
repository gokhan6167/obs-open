import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service.js';
import { YoksisService } from './yoksis.service.js';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportService,
    private readonly yoksis: YoksisService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Yönetim dashboard (öğrenci/kayıt/tahsilat özeti)' })
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('students-by-program')
  @ApiOperation({ summary: 'Programa göre öğrenci sayıları' })
  studentsByProgram() {
    return this.reports.studentsByProgram();
  }

  @Post('yoksis/export-enrollments')
  @ApiOperation({ summary: 'Öğrenci kayıtlarını YÖKSİS adaptörüne aktar (mock)' })
  yoksisExport() {
    return this.yoksis.exportEnrollments();
  }
}
