import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GraduationService } from './graduation.service.js';

@ApiTags('graduation')
@Controller('graduation/students')
export class GraduationController {
  constructor(private readonly service: GraduationService) {}

  private onDate(date?: string): string {
    return date ?? new Date().toISOString().slice(0, 10);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Mezuniyete ne kaldı (tamamlama + GNO + onur)' })
  status(@Param('id') id: string, @Query('date') date?: string) {
    return this.service.checkGraduation(id, this.onDate(date));
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Mezuniyet onayı (durum makinesi -> mezun + diploma no + audit)' })
  approve(@Param('id') id: string, @Query('date') date?: string) {
    return this.service.approveGraduation(id, this.onDate(date));
  }
}
