import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GpaPolicy, GradeScale } from '@obs/academic-core';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import {
  academicRuleSets,
  gpaPolicies,
  gradeScales,
  type AcademicRules,
} from '../db/schema-parameters.js';
import { withTenant } from '../db/tenant-context.js';
import { selectEffective } from './effective.js';

/**
 * Mevzuat parametrelerini (harf notu ölçeği, GNO politikası, kural seti) DB'den
 * çözer ve academic-core tiplerine dönüştürür. Tüm hesaplar bu çözümlenmiş
 * parametreleri kullanır — böylece hiçbir değer koda gömülü kalmaz.
 *
 * RLS + withTenant sayesinde sorgular zaten tenant'a kısıtlı; selectEffective
 * program + tarih spesifikliğini uygular.
 */
@Injectable()
export class ParametersService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async resolveGradeScale(
    tenantId: string,
    programId: string,
    onDate: string,
  ): Promise<GradeScale> {
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx.select().from(gradeScales),
    );
    const chosen = selectEffective(rows, { programId, onDate });
    if (!chosen) {
      throw new NotFoundException(`Yürürlükte harf notu ölçeği yok (program=${programId})`);
    }
    return { id: chosen.id, bands: chosen.bands };
  }

  async resolveGpaPolicy(tenantId: string, programId: string, onDate: string): Promise<GpaPolicy> {
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx.select().from(gpaPolicies),
    );
    const chosen = selectEffective(rows, { programId, onDate });
    if (!chosen) {
      throw new NotFoundException(`Yürürlükte GNO politikası yok (program=${programId})`);
    }
    return {
      repeatPolicy: chosen.repeatPolicy,
      rounding: { digits: chosen.roundingDigits, mode: chosen.roundingMode },
    };
  }

  async resolveRuleSet(tenantId: string, programId: string, onDate: string): Promise<AcademicRules> {
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx.select().from(academicRuleSets),
    );
    const chosen = selectEffective(rows, { programId, onDate });
    if (!chosen) {
      throw new NotFoundException(`Yürürlükte akademik kural seti yok (program=${programId})`);
    }
    return chosen.rules;
  }
}
