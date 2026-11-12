import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { academicTerms, calendarEvents } from '../db/schema-academic.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { isEventOpen, type CalendarWindow } from './calendar-window.js';

export interface TermView {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

/** Akademik takvim servisi. Aktif dönem + olay pencereleri. */
@Injectable()
export class CalendarService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async getActiveTerm(): Promise<TermView | null> {
    const { tenantId } = requireTenant();
    const row = await withTenant(this.handle.db, tenantId, async (tx) => {
      const [t] = await tx
        .select()
        .from(academicTerms)
        .where(eq(academicTerms.isActive, true))
        .limit(1);
      return t;
    });
    if (!row) return null;
    return {
      id: row.id,
      year: row.year,
      term: row.term,
      name: row.name,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
    };
  }

  async listWindows(termId: string): Promise<CalendarWindow[]> {
    const { tenantId } = requireTenant();
    const rows = await withTenant(this.handle.db, tenantId, (tx) =>
      tx.select().from(calendarEvents).where(eq(calendarEvents.termId, termId)),
    );
    return rows.map((r) => ({
      type: r.type,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
    }));
  }

  /** Verilen tip penceresi verilen anda (varsayılan: şimdi) açık mı. */
  async isOpen(termId: string, type: string, atIso: string): Promise<boolean> {
    const windows = await this.listWindows(termId);
    return isEventOpen(windows, type, atIso);
  }
}
