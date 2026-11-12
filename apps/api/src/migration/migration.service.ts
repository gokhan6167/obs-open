import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { requireRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import {
  migrationRuns,
  quarantineRows,
  reconciliationExceptions,
  stagingRows,
} from '../db/schema-migration.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { applyMapping, type MappingConfig, type SourceRow } from './mapping.js';
import { reconcileBatch, type TranscriptSummary } from './reconcile.js';

const MIGRATION_ROLES = ['oidb', 'sistem_yoneticisi'];

/**
 * Veri göçü servisi (M11). Prova (dry_run) + canlı koşum; mapping ile staging'e
 * yükleme, kirli veriyi karantinaya, mutabakat istisnalarını üretme. Canlıya
 * geçiş, istisna + karantina sıfırlanmadan ENGELLENİR.
 */
@Injectable()
export class MigrationService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async startRun(mode: 'dry_run' | 'live'): Promise<{ runId: string }> {
    const ctx = requireTenant();
    requireRole(ctx, MIGRATION_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(migrationRuns)
        .values({ tenantId: ctx.tenantId, mode })
        .returning({ id: migrationRuns.id });
      return { runId: row!.id };
    });
  }

  /** Ham satırları mapping ile staging'e; hatalıları karantinaya. */
  async loadRows(
    runId: string,
    sourceTable: string,
    rows: readonly SourceRow[],
    config: MappingConfig,
  ): Promise<{ loaded: number; quarantined: number }> {
    const ctx = requireTenant();
    requireRole(ctx, MIGRATION_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      let loaded = 0;
      let quarantined = 0;
      for (const row of rows) {
        const result = applyMapping(config, row);
        if (result.ok) {
          await tx.insert(stagingRows).values({
            tenantId: ctx.tenantId,
            migrationRunId: runId,
            sourceTable,
            record: result.record,
          });
          loaded += 1;
        } else {
          await tx.insert(quarantineRows).values({
            tenantId: ctx.tenantId,
            migrationRunId: runId,
            sourceTable,
            raw: row,
            reason: result.errors.join('; '),
          });
          quarantined += 1;
        }
      }
      return { loaded, quarantined };
    });
  }

  /** Mutabakat: OİS↔yeni transkript karşılaştır, istisnaları persist et. */
  async runReconciliation(
    runId: string,
    pairs: readonly { ois: TranscriptSummary; next: TranscriptSummary }[],
    gpaTolerance = 0.01,
  ): Promise<{ totalExceptions: number }> {
    const ctx = requireTenant();
    requireRole(ctx, MIGRATION_ROLES);
    const { byStudent, totalExceptions } = reconcileBatch(pairs, { gpaTolerance });
    await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      for (const exceptions of Object.values(byStudent)) {
        for (const e of exceptions) {
          await tx.insert(reconciliationExceptions).values({
            tenantId: ctx.tenantId,
            migrationRunId: runId,
            studentNo: e.studentNo,
            field: e.field,
            oisValue: e.oisValue,
            newValue: e.newValue,
          });
        }
      }
    });
    return { totalExceptions };
  }

  /**
   * Canlıya geçiş kontrolü: çözülmemiş mutabakat istisnası VEYA karantina varsa
   * geçiş ENGELLENİR (§M11 "istisna raporu sıfırlanmadan canlıya geçilmez").
   */
  async goLiveReadiness(runId: string): Promise<{
    canGoLive: boolean;
    unresolvedExceptions: number;
    unresolvedQuarantine: number;
  }> {
    const ctx = requireTenant();
    requireRole(ctx, MIGRATION_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [run] = await tx
        .select({ id: migrationRuns.id })
        .from(migrationRuns)
        .where(eq(migrationRuns.id, runId))
        .limit(1);
      if (!run) {
        throw new NotFoundException('Göç koşumu bulunamadı');
      }
      const [exc] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(reconciliationExceptions)
        .where(
          and(
            eq(reconciliationExceptions.migrationRunId, runId),
            eq(reconciliationExceptions.resolved, false),
          ),
        );
      const [quar] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(quarantineRows)
        .where(and(eq(quarantineRows.migrationRunId, runId), eq(quarantineRows.resolved, false)));

      const unresolvedExceptions = Number(exc?.n ?? 0);
      const unresolvedQuarantine = Number(quar?.n ?? 0);
      return {
        canGoLive: unresolvedExceptions === 0 && unresolvedQuarantine === 0,
        unresolvedExceptions,
        unresolvedQuarantine,
      };
    });
  }
}
