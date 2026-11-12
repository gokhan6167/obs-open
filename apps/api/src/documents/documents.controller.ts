import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service.js';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('students/:studentId/transcript')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="transkript.pdf"')
  @ApiOperation({ summary: 'Transkript üret (doğrulama kodu + QR + audit) — PDF döner' })
  async transcript(
    @Param('studentId') studentId: string,
    @Query('date') date?: string,
  ): Promise<StreamableFile> {
    const onDate = date ?? new Date().toISOString().slice(0, 10);
    const { pdf } = await this.service.issueTranscript(studentId, onDate);
    return new StreamableFile(pdf);
  }
}

/**
 * Herkese açık belge doğrulama — kimlik/tenant GEREKTİRMEZ. verify/{kod} sayfası.
 */
@ApiTags('public')
@Controller('public')
export class PublicVerifyController {
  constructor(private readonly service: DocumentsService) {}

  @Get('verify/:code')
  @ApiOperation({ summary: 'Belge doğrula (public): kod geçerli mi, kime ait, tarih' })
  verify(@Param('code') code: string) {
    return this.service.verify(code);
  }
}
