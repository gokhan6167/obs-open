import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import type { MappingConfig } from './mapping.js';
import { MigrationService } from './migration.service.js';

const startSchema = z.object({ mode: z.enum(['dry_run', 'live']) });
type StartDto = z.infer<typeof startSchema>;

const mappingConfigSchema = z.object({
  target: z.string(),
  fields: z.array(
    z.object({
      target: z.string(),
      source: z.string().optional(),
      const: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      transforms: z.array(z.enum(['trim', 'upper', 'lower', 'int', 'nullIfEmpty'])).optional(),
      required: z.boolean().optional(),
    }),
  ),
});

const loadSchema = z.object({
  sourceTable: z.string(),
  rows: z.array(z.record(z.unknown())),
  config: mappingConfigSchema,
});
type LoadDto = z.infer<typeof loadSchema>;

const transcriptSchema = z.object({
  studentNo: z.string(),
  gpa: z.number(),
  totalCredit: z.number(),
  courseCount: z.number(),
  letters: z.record(z.string()),
});
const reconcileSchema = z.object({
  pairs: z.array(z.object({ ois: transcriptSchema, next: transcriptSchema })),
  gpaTolerance: z.number().optional(),
});
type ReconcileDto = z.infer<typeof reconcileSchema>;

@ApiTags('migration')
@Controller('migration')
export class MigrationController {
  constructor(private readonly service: MigrationService) {}

  @Post('runs')
  @ApiOperation({ summary: 'Göç koşumu başlat (dry_run/live)' })
  start(@Body(new ZodValidationPipe(startSchema)) body: StartDto) {
    return this.service.startRun(body.mode);
  }

  @Post('runs/:id/load')
  @ApiOperation({ summary: 'Ham satırları mapping ile staging/karantinaya yükle' })
  load(@Param('id') id: string, @Body(new ZodValidationPipe(loadSchema)) body: LoadDto) {
    return this.service.loadRows(id, body.sourceTable, body.rows, body.config as MappingConfig);
  }

  @Post('runs/:id/reconcile')
  @ApiOperation({ summary: 'Mutabakat çalıştır (OİS↔yeni transkript)' })
  reconcile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reconcileSchema)) body: ReconcileDto,
  ) {
    return this.service.runReconciliation(id, body.pairs, body.gpaTolerance);
  }

  @Get('runs/:id/readiness')
  @ApiOperation({ summary: 'Canlıya geçiş hazır mı (istisna+karantina 0 olmalı)' })
  readiness(@Param('id') id: string) {
    return this.service.goLiveReadiness(id);
  }
}
