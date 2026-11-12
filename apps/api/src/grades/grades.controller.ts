import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ExcelService } from './excel.service.js';
import { GradesService } from './grades.service.js';

const draftSchema = z.object({
  studentId: z.string().uuid(),
  sectionId: z.string().uuid(),
  termId: z.string().uuid(),
  rawScore: z.number(),
  letter: z.string().min(1).max(4),
  coefficient: z.number(),
  evaluationType: z.enum(['absolute', 'relative']).optional(),
});
type DraftDto = z.infer<typeof draftSchema>;

const transitionSchema = z.object({ to: z.enum(['announced', 'finalized', 'draft']) });
type TransitionDto = z.infer<typeof transitionSchema>;

const correctionSchema = z.object({
  newLetter: z.string().min(1).max(4),
  newRaw: z.number(),
  newCoefficient: z.number(),
  reason: z.string().min(1),
  decisionNo: z.string().min(1),
});
type CorrectionDto = z.infer<typeof correctionSchema>;

const bulkSchema = z.object({
  rows: z.array(z.object({ studentNo: z.string(), score: z.union([z.number(), z.string()]) })),
});
type BulkDto = z.infer<typeof bulkSchema>;

const openAppealSchema = z.object({ reason: z.string().min(1) });
type OpenAppealDto = z.infer<typeof openAppealSchema>;

const decideAppealSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().optional(),
});
type DecideAppealDto = z.infer<typeof decideAppealSchema>;

@ApiTags('grades')
@Controller('grades')
export class GradesController {
  constructor(
    private readonly service: GradesService,
    private readonly excel: ExcelService,
  ) {}

  @Get('active-scale')
  @ApiOperation({ summary: 'Aktif harf notu ölçeği (personel okuma; hardcoded band yerine)' })
  activeScale() {
    return this.service.activeScale();
  }

  @Get('sections/:sectionId/components')
  @ApiOperation({ summary: 'Şube not bileşenleri (id/name/weight/locked) + toplam ağırlık' })
  sectionComponents(@Param('sectionId') sectionId: string) {
    return this.service.sectionComponents(sectionId);
  }

  @Get('sections/:sectionId/roster')
  @ApiOperation({ summary: 'Şubeye kayıtlı öğrenciler + bileşen puanı + ders-sonu notu' })
  sectionRoster(@Param('sectionId') sectionId: string) {
    return this.service.sectionRoster(sectionId);
  }

  @Post('draft')
  @ApiOperation({ summary: 'Taslak not gir/güncelle' })
  draft(@Body(new ZodValidationPipe(draftSchema)) body: DraftDto) {
    return this.service.setDraftGrade(body);
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Not ilan et / kesinleştir' })
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: TransitionDto,
  ) {
    return this.service.transition(id, body.to);
  }

  @Post(':id/correction')
  @ApiOperation({ summary: 'İlan sonrası not düzeltme (karar no + gerekçe + audit)' })
  correction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctionSchema)) body: CorrectionDto,
  ) {
    return this.service.applyCorrection({ gradeId: id, ...body });
  }

  @Get('appeals')
  @ApiOperation({ summary: 'Not itirazı kuyruğu (personel; ?status ile filtre)' })
  listAppeals(@Query('status') status?: string) {
    return this.service.listAppeals(status);
  }

  @Post(':id/appeal')
  @ApiOperation({ summary: 'Not itirazı aç (öğrenci, kendi ilan edilmiş notu)' })
  openAppeal(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(openAppealSchema)) body: OpenAppealDto,
  ) {
    return this.service.openAppeal({ gradeId: id, reason: body.reason });
  }

  @Post('appeals/:appealId/decision')
  @ApiOperation({ summary: 'Not itirazını karara bağla (kabul/ret + audit)' })
  decideAppeal(
    @Param('appealId') appealId: string,
    @Body(new ZodValidationPipe(decideAppealSchema)) body: DecideAppealDto,
  ) {
    return this.service.decideAppeal(appealId, body);
  }

  @Post('components/:componentId/scores/bulk')
  @ApiOperation({ summary: 'Toplu bileşen notu girişi (JSON) — hatalı satır raporuyla' })
  bulk(
    @Param('componentId') componentId: string,
    @Body(new ZodValidationPipe(bulkSchema)) body: BulkDto,
  ) {
    return this.service.bulkImportComponentScores(componentId, body.rows);
  }

  @Get('sections/:sectionId/template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="not-sablonu.xlsx"')
  @ApiOperation({ summary: 'Not giriş Excel şablonu (şubeye kayıtlı öğrenciler)' })
  async template(@Param('sectionId') sectionId: string): Promise<StreamableFile> {
    const list = await this.service.sectionStudents(sectionId);
    const buffer = await this.excel.buildScoreTemplate(list);
    return new StreamableFile(buffer);
  }

  @Post('components/:componentId/import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Excel yükleyerek toplu not girişi — hatalı satır raporuyla' })
  async import(
    @Param('componentId') componentId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Dosya gerekli');
    }
    const rows = await this.excel.parseScoreSheet(file.buffer);
    return this.service.bulkImportComponentScores(componentId, rows);
  }
}
