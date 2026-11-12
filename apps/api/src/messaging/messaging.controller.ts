import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { MessagingService } from './messaging.service.js';

const createSchema = z.object({
  toUserId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});
type CreateDto = z.infer<typeof createSchema>;

@ApiTags('messaging')
@Controller('messaging')
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get('inbox')
  @ApiOperation({ summary: 'Gelen kutusu (aktöre gelenler; gönderen email)' })
  inbox() {
    return this.service.inbox();
  }

  @Get('sent')
  @ApiOperation({ summary: 'Gönderilenler (aktörün gönderdikleri; alıcı email)' })
  sent() {
    return this.service.sent();
  }

  @Get('recipients')
  @ApiOperation({ summary: 'Tenant kullanıcıları (userId+email; ADMIN/personel)' })
  recipients() {
    return this.service.recipients();
  }

  @Post()
  @ApiOperation({ summary: 'Mesaj gönder (fromUserId=aktör)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mesajı okundu işaretle (yalnız alıcı)' })
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }
}
