import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { httpUrl } from '../common/url.schema.js';
import { AdmissionsDeepService } from './admissions-deep.service.js';

const trackSchema = z.object({
  pin: z.string().min(4).max(20),
  nationalId: z.string().min(1).max(20),
});
type TrackDto = z.infer<typeof trackSchema>;

const createDocumentSchema = z.object({
  kind: z.string().min(1).max(120),
  fileName: z.string().max(400).optional(),
  fileUrl: httpUrl(1000).optional(),
});
type CreateDocumentDto = z.infer<typeof createDocumentSchema>;

const verifyDocumentSchema = z.object({
  verified: z.boolean(),
});
type VerifyDocumentDto = z.infer<typeof verifyDocumentSchema>;

const serviceSchema = z.enum(['mernis', 'osym', 'yoksis', 'sgk']);
type ServiceDto = z.infer<typeof serviceSchema>;

const externalQuerySchema = z.object({
  operation: z.string().min(1).max(120),
  subjectRef: z.string().min(1).max(200),
});
type ExternalQueryDto = z.infer<typeof externalQuerySchema>;

@ApiTags('admissions-deep')
@Controller('admissions-deep')
export class AdmissionsDeepController {
  constructor(private readonly service: AdmissionsDeepService) {}

  @Post('applicants/:id/pin')
  @ApiOperation({ summary: 'Aday için 8 haneli PIN üret + kaydet (personel + audit)' })
  issuePin(@Param('id') id: string) {
    return this.service.issuePin(id);
  }

  @Get('track')
  @ApiOperation({ summary: 'PIN + TC ile aday durum sorgulama (personel şartı yok, dar alan seti)' })
  track(@Query(new ZodValidationPipe(trackSchema)) query: TrackDto) {
    return this.service.track(query.pin, query.nationalId);
  }

  @Get('applicants/:id/documents')
  @ApiOperation({ summary: 'Adayın başvuru belgeleri (personel)' })
  listDocuments(@Param('id') id: string) {
    return this.service.listDocuments(id);
  }

  @Post('applicants/:id/documents')
  @ApiOperation({ summary: 'Adaya başvuru belgesi ekle (personel + audit)' })
  createDocument(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocumentDto,
  ) {
    return this.service.createDocument(id, body);
  }

  @Patch('documents/:docId')
  @ApiOperation({ summary: 'Belge doğrulama durumunu güncelle (personel + audit)' })
  verifyDocument(
    @Param('docId') docId: string,
    @Body(new ZodValidationPipe(verifyDocumentSchema)) body: VerifyDocumentDto,
  ) {
    return this.service.verifyDocument(docId, body.verified);
  }

  @Post('programs/:programId/rank')
  @ApiOperation({ summary: 'Yerleştirme: puana göre sırala, kontenjan kadarını kazandır (personel)' })
  rank(@Param('programId') programId: string) {
    return this.service.rank(programId);
  }

  @Get('external-logs')
  @ApiOperation({ summary: 'Dış servis çağrı logları (opsiyonel ?service filtresi)' })
  externalLogs(@Query('service') service?: string) {
    return this.service.listExternalLogs(service);
  }

  @Post('external/:service/query')
  @ApiOperation({ summary: 'MOCK dış servis sorgusu (mernis/osym/yoksis/sgk) — gerçek çağrı yok' })
  externalQuery(
    @Param('service', new ZodValidationPipe(serviceSchema)) service: ServiceDto,
    @Body(new ZodValidationPipe(externalQuerySchema)) body: ExternalQueryDto,
  ) {
    return this.service.externalQuery(service, body);
  }
}
