import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { httpUrl } from '../common/url.schema.js';
import { PhotoService } from './photo.service.js';

const createSchema = z.object({
  photoUrl: httpUrl(500),
});
type CreateDto = z.infer<typeof createSchema>;

const reviewSchema = z.object({
  status: z.enum(['onayli', 'reddedildi']),
});
type ReviewDto = z.infer<typeof reviewSchema>;

@ApiTags('photo')
@Controller('photo')
export class PhotoController {
  constructor(private readonly service: PhotoService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Beklemedeki fotoğraf istekleri (personel + kullanıcı e-posta)' })
  pending() {
    return this.service.pending();
  }

  @Post()
  @ApiOperation({ summary: 'Fotoğraf isteği oluştur (aktör kendi isteği, status beklemede)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Fotoğraf isteğini onayla/reddet (personel; onaylıysa users.photoUrl güncelle)' })
  review(@Param('id') id: string, @Body(new ZodValidationPipe(reviewSchema)) body: ReviewDto) {
    return this.service.review(id, body);
  }
}
