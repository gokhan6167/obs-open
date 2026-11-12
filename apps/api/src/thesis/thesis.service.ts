import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { thesisTopics } from '../db/schema-services.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GRADUATE_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma/karar yetkisi (discipline.service STAFF ile bire bir).
const STAFF = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'koordinator',
  'fakulte_sekreteri',
  'mali_isler',
  'rektorluk',
  'danisman',
  'ogretim_elemani',
];
const isStaff = (roles: readonly string[] = []): boolean => roles.some((r) => STAFF.includes(r));

export interface CreateThesisInput {
  title: string;
  summary?: string | undefined;
  advisorUserId?: string | undefined;
}

export interface DecideThesisInput {
  status: 'onaylandi' | 'reddedildi';
  decisionNote?: string | undefined;
}

/**
 * Tez/proje konusu servisi (0019). Tenant-kapsamlı (RLS). Öğrenci kendi tez
 * başvurusunu oluşturur/görür; personel/danışman kuyruğu görür ve karar verir.
 */
@Injectable()
export class ThesisService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktör öğrencinin tez başvuruları, en yeni önce. */
  async my(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select()
        .from(thesisTopics)
        .where(eq(thesisTopics.studentId, sid))
        .orderBy(desc(thesisTopics.createdAt));
    });
  }

  /** Aktör öğrenci yeni tez/proje konusu başvurusu oluşturur. */
  async create(input: CreateThesisInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Tez başvurusu için öğrenci kaydınız bulunamadı');
      }
      const [row] = await tx
        .insert(thesisTopics)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          title: input.title,
          summary: input.summary ?? null,
          advisorUserId: input.advisorUserId ?? null,
          status: 'basvuruldu',
        })
        .returning();
      return row!;
    });
  }

  /** Tez başvuru kuyruğu (personel/danışman): öğrenci ad + danışman e-posta join. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Tez başvurularına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const advisor = alias(users, 'advisor');
      const items = await tx
        .select({
          id: thesisTopics.id,
          studentId: thesisTopics.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          title: thesisTopics.title,
          summary: thesisTopics.summary,
          advisorUserId: thesisTopics.advisorUserId,
          advisorEmail: advisor.email,
          status: thesisTopics.status,
          decisionNote: thesisTopics.decisionNote,
          createdAt: thesisTopics.createdAt,
        })
        .from(thesisTopics)
        .innerJoin(students, eq(thesisTopics.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .leftJoin(advisor, eq(thesisTopics.advisorUserId, advisor.id))
        .orderBy(desc(thesisTopics.createdAt));
      return { items };
    });
  }

  /** Tez başvurusuna karar (onaylandı/reddedildi) — personel/danışman. */
  async decide(id: string, input: DecideThesisInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GRADUATE_ADMIN)) {
      throw new ForbiddenException('Tez başvurusuna karar verme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(thesisTopics)
        .set({ status: input.status, decisionNote: input.decisionNote ?? null })
        .where(eq(thesisTopics.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Tez başvurusu bulunamadı');
      }
      return row;
    });
  }

  private async myStudentId(tx: Tx, actorUserId?: string): Promise<string | null> {
    if (!actorUserId) return null;
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, actorUserId))
      .limit(1);
    return s?.id ?? null;
  }
}
