import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalendarService } from './calendar.service.js';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get('active-term')
  @ApiOperation({ summary: 'Aktif akademik dönemi getir' })
  activeTerm() {
    return this.service.getActiveTerm();
  }

  @Get('terms/:termId/windows')
  @ApiOperation({ summary: 'Dönemin takvim pencerelerini listele' })
  windows(@Param('termId') termId: string) {
    return this.service.listWindows(termId);
  }

  @Get('terms/:termId/open')
  @ApiOperation({ summary: 'Verilen tip penceresi belirtilen anda açık mı' })
  isOpen(@Param('termId') termId: string, @Query('type') type: string, @Query('at') at?: string) {
    const atIso = at ?? new Date().toISOString();
    return this.service.isOpen(termId, type, atIso).then((open) => ({ type, at: atIso, open }));
  }
}
