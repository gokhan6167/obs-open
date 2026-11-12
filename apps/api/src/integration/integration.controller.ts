import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { httpUrl } from '../common/url.schema.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { IntegrationService } from './integration.service.js';

const upsertSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  // Kullanıcıdan gelen URL: javascript:/data: şemalarını elemek için httpUrl().
  baseUrl: httpUrl().optional(),
  enabled: z.boolean().optional(),
  mode: z.enum(['mock', 'live']).optional(),
  config: z.record(z.unknown()).optional(),
});
type UpsertDto = z.infer<typeof upsertSchema>;

const notifySchema = z.object({
  channel: z.enum(['sms', 'email']),
  recipient: z.string().min(1).max(200),
  subject: z.string().max(300).optional(),
  body: z.string().min(1).max(5000),
});
type NotifyDto = z.infer<typeof notifySchema>;

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  @Get()
  @ApiOperation({ summary: 'Entegrasyonlar (tanımsızlar varsayılan listeyle birleşik)' })
  list() {
    return this.service.list();
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Son bildirim logları (personel; ?channel)' })
  notifications(@Query('channel') channel?: string) {
    return this.service.notifications(channel);
  }

  @Post('notify')
  @ApiOperation({ summary: 'Bildirim gönder (MOCK; gerçek gönderim yok, yanıt _mock:true)' })
  notify(@Body(new ZodValidationPipe(notifySchema)) body: NotifyDto) {
    return this.service.notify(body);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Kanal bazlı gönderim sayıları + entegrasyon durum özeti' })
  stats() {
    return this.service.stats();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Entegrasyon tanımı upsert (personel)' })
  upsert(@Param('key') key: string, @Body(new ZodValidationPipe(upsertSchema)) body: UpsertDto) {
    return this.service.upsert(key, body);
  }
}
