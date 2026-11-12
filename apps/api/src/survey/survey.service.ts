import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { surveys, surveyResponses } from '../db/schema-backoffice3.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/yazma yetkisi (discipline.service STAFF ile bire bir).
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

export interface CreateSurveyInput {
  title: string;
  description?: string | undefined;
  kind: 'anket' | 'degerlendirme';
}

export interface RespondInput {
  answers: Record<string, unknown>;
}

/**
 * Anket/değerlendirme servisi (0016 backoffice3). Tenant-kapsamlı (RLS).
 * Listeleme ve cevaplama aktöre açık; oluşturma/özet personel yetkisi ister
 * ve audit'lenir. Cevaplar kişi başı tek (surveyResponses unique).
 */
@Injectable()
export class SurveyService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktif anketler; aktörün her biri için cevaplayıp cevaplamadığı işaretlenir. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: surveys.id,
          title: surveys.title,
          description: surveys.description,
          kind: surveys.kind,
          active: surveys.active,
          createdAt: surveys.createdAt,
          responded: sql<boolean>`(${surveyResponses.id} is not null)`,
        })
        .from(surveys)
        .leftJoin(
          surveyResponses,
          and(
            eq(surveyResponses.surveyId, surveys.id),
            eq(surveyResponses.userId, ctx.actorUserId ?? sql`null`),
          ),
        )
        .where(eq(surveys.active, true))
        .orderBy(desc(surveys.createdAt));
      return { items };
    });
  }

  /** Anket/değerlendirme oluştur (personel) + audit. */
  async create(input: CreateSurveyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Anket oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(surveys)
        .values({
          tenantId: ctx.tenantId,
          title: input.title,
          description: input.description ?? null,
          kind: input.kind,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'survey.create',
        resourceType: 'survey',
        resourceId: row!.id,
        diff: { title: input.title, kind: input.kind },
      });

      return row!;
    });
  }

  /** Anket cevap sayısı/özeti (personel). */
  async responses(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Anket cevaplarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [survey] = await tx
        .select({
          id: surveys.id,
          title: surveys.title,
          kind: surveys.kind,
          active: surveys.active,
        })
        .from(surveys)
        .where(eq(surveys.id, id))
        .limit(1);
      if (!survey) {
        throw new NotFoundException('Anket bulunamadı');
      }

      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .where(eq(surveyResponses.surveyId, id));

      return { survey, responseCount: counted?.count ?? 0 };
    });
  }

  /** Ankete cevap ver (aktör). Kişi başı tek cevap (unique). */
  async respond(id: string, input: RespondInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const actorUserId = ctx.actorUserId;
    if (!actorUserId) {
      throw new ForbiddenException('Cevap vermek için oturum gerekli');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [survey] = await tx
        .select({ id: surveys.id, active: surveys.active })
        .from(surveys)
        .where(eq(surveys.id, id))
        .limit(1);
      if (!survey) {
        throw new NotFoundException('Anket bulunamadı');
      }
      if (!survey.active) {
        throw new ConflictException('Anket aktif değil');
      }

      const [existing] = await tx
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.surveyId, id),
            eq(surveyResponses.userId, actorUserId),
          ),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu ankete zaten cevap verdiniz');
      }

      const [row] = await tx
        .insert(surveyResponses)
        .values({
          tenantId: ctx.tenantId,
          surveyId: id,
          userId: actorUserId,
          answers: input.answers,
        })
        .returning();

      return row!;
    });
  }
}
