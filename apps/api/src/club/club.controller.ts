import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ClubService } from './club.service.js';

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  advisorUserId: z.string().uuid().optional(),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('clubs')
@Controller('clubs')
export class ClubController {
  constructor(private readonly service: ClubService) {}

  @Get()
  @ApiOperation({ summary: 'Tüm kulüpler + üye sayısı' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Kulüp oluştur (personel)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Get('my')
  @ApiOperation({ summary: 'Aktör öğrencinin üyelikleri' })
  my() {
    return this.service.my();
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Kulüp üyeleri (öğrenci ad)' })
  members(@Param('id') id: string) {
    return this.service.members(id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Aktör öğrenci kulübe üye olur (zaten üye ise 409)' })
  join(@Param('id') id: string) {
    return this.service.join(id);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Aktör öğrenci kulüpten çıkar' })
  leave(@Param('id') id: string) {
    return this.service.leave(id);
  }
}
