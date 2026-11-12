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
import { students } from '../db/schema-academic.js';
import { clubMemberships, studentClubs } from '../db/schema-services.js';
import { users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

export interface CreateClubInput {
  name: string;
  description?: string | undefined;
  advisorUserId?: string | undefined;
}

/**
 * Öğrenci kulüpleri servisi (0019). Tenant-kapsamlı (RLS). Kulüp oluşturma öğrenci
 * işleri yetkilisi; katılma/çıkma aktör öğrencinin kendi kaydı (sahiplik).
 */
@Injectable()
export class ClubService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Tüm kulüpler + üye sayısı, en yeni önce. */
  async list(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          id: studentClubs.id,
          name: studentClubs.name,
          description: studentClubs.description,
          advisorUserId: studentClubs.advisorUserId,
          status: studentClubs.status,
          createdAt: studentClubs.createdAt,
          memberCount: sql<number>`count(${clubMemberships.id})::int`,
        })
        .from(studentClubs)
        .leftJoin(clubMemberships, eq(clubMemberships.clubId, studentClubs.id))
        .groupBy(studentClubs.id)
        .orderBy(desc(studentClubs.createdAt)),
    );
  }

  /** Kulüp oluştur (öğrenci işleri yetkilisi). */
  async create(input: CreateClubInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Kulüp oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(studentClubs)
        .values({
          tenantId: ctx.tenantId,
          name: input.name,
          description: input.description ?? null,
          advisorUserId: input.advisorUserId ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Kulüp üyeleri (öğrenci no/ad). */
  async members(clubId: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [club] = await tx
        .select({ id: studentClubs.id })
        .from(studentClubs)
        .where(eq(studentClubs.id, clubId))
        .limit(1);
      if (!club) {
        throw new NotFoundException('Kulüp bulunamadı');
      }
      return tx
        .select({
          studentId: clubMemberships.studentId,
          studentNo: students.studentNo,
          fullName: users.email,
          role: clubMemberships.role,
          joinedAt: clubMemberships.createdAt,
        })
        .from(clubMemberships)
        .innerJoin(students, eq(clubMemberships.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(clubMemberships.clubId, clubId))
        .orderBy(desc(clubMemberships.createdAt));
    });
  }

  /** Aktör öğrencinin üyelikleri (kulüp bilgisi ile). */
  async my(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          membershipId: clubMemberships.id,
          clubId: studentClubs.id,
          name: studentClubs.name,
          description: studentClubs.description,
          role: clubMemberships.role,
          joinedAt: clubMemberships.createdAt,
        })
        .from(clubMemberships)
        .innerJoin(studentClubs, eq(clubMemberships.clubId, studentClubs.id))
        .where(eq(clubMemberships.studentId, sid))
        .orderBy(desc(clubMemberships.createdAt));
    });
  }

  /** Aktör öğrenci kulübe üye olur (zaten üye ise 409). */
  async join(clubId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Yalnızca öğrenci kulübe katılabilir');
      }
      const [club] = await tx
        .select({ id: studentClubs.id })
        .from(studentClubs)
        .where(eq(studentClubs.id, clubId))
        .limit(1);
      if (!club) {
        throw new NotFoundException('Kulüp bulunamadı');
      }
      const [existing] = await tx
        .select({ id: clubMemberships.id })
        .from(clubMemberships)
        .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.studentId, sid)))
        .limit(1);
      if (existing) {
        throw new ConflictException('Kulübe zaten üyesiniz');
      }
      const [row] = await tx
        .insert(clubMemberships)
        .values({
          tenantId: ctx.tenantId,
          clubId,
          studentId: sid,
        })
        .returning();
      return row!;
    });
  }

  /** Aktör öğrenci kulüpten çıkar. */
  async leave(clubId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Yalnızca öğrenci kulüpten çıkabilir');
      }
      const [row] = await tx
        .delete(clubMemberships)
        .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.studentId, sid)))
        .returning();
      if (!row) {
        throw new NotFoundException('Üyelik bulunamadı');
      }
      return { ok: true, clubId };
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
