import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ACADEMIC_ADMIN, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { courses } from '../db/schema-academic.js';
import { electivePoolCourses, electivePools } from '../db/schema-missing.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (facilities STAFF ile bire bir).
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

export interface CreatePoolInput {
  code: string;
  name: string;
  kind?: string | undefined;
}

export interface UpdatePoolStatusInput {
  status: string;
}

/**
 * Seçmeli havuz servisi (0018). Tenant-kapsamlı (RLS), personel yetkisi
 * in-service kontrol edilir.
 */
@Injectable()
export class ElectivePoolService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Havuz listesi; her havuzun ders sayısı ile (personel). */
  async listPools(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Seçmeli havuz kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: electivePools.id,
          code: electivePools.code,
          name: electivePools.name,
          kind: electivePools.kind,
          status: electivePools.status,
          createdAt: electivePools.createdAt,
          courseCount: sql<number>`count(${electivePoolCourses.id})::int`,
        })
        .from(electivePools)
        .leftJoin(electivePoolCourses, eq(electivePoolCourses.poolId, electivePools.id))
        .groupBy(electivePools.id)
        .orderBy(asc(electivePools.code));
      return { items };
    });
  }

  /** Havuz oluştur (akademik yetkili). */
  async createPool(input: CreatePoolInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Seçmeli havuz oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(electivePools)
        .values({
          tenantId: ctx.tenantId,
          code: input.code,
          name: input.name,
          ...(input.kind ? { kind: input.kind } : {}),
        })
        .returning();
      return row!;
    });
  }

  /** Havuz durumunu güncelle (akademik yetkili). */
  async updatePoolStatus(
    id: string,
    input: UpdatePoolStatusInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Seçmeli havuz güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(electivePools)
        .set({ status: input.status })
        .where(eq(electivePools.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Seçmeli havuz bulunamadı');
      }
      return row;
    });
  }

  /** Havuzdaki dersler; ders bilgisi join (personel). */
  async listPoolCourses(poolId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Seçmeli havuz kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [pool] = await tx
        .select({ id: electivePools.id })
        .from(electivePools)
        .where(eq(electivePools.id, poolId))
        .limit(1);
      if (!pool) {
        throw new NotFoundException('Seçmeli havuz bulunamadı');
      }

      const items = await tx
        .select({
          id: electivePoolCourses.id,
          poolId: electivePoolCourses.poolId,
          courseId: electivePoolCourses.courseId,
          courseCode: courses.code,
          courseNameTr: courses.nameTr,
          courseNameEn: courses.nameEn,
          ects: courses.ects,
          localCredit: courses.localCredit,
          createdAt: electivePoolCourses.createdAt,
        })
        .from(electivePoolCourses)
        .innerJoin(courses, eq(electivePoolCourses.courseId, courses.id))
        .where(eq(electivePoolCourses.poolId, poolId))
        .orderBy(asc(courses.code));
      return { items };
    });
  }

  /** Havuza ders ekle (akademik yetkili). Aynı ders 409. */
  async addPoolCourse(poolId: string, courseId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ACADEMIC_ADMIN)) {
      throw new ForbiddenException('Seçmeli havuza ders ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [pool] = await tx
        .select({ id: electivePools.id })
        .from(electivePools)
        .where(eq(electivePools.id, poolId))
        .limit(1);
      if (!pool) {
        throw new NotFoundException('Seçmeli havuz bulunamadı');
      }

      const [course] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);
      if (!course) {
        throw new NotFoundException('Ders bulunamadı');
      }

      // Aynı ders kontrolü (poolId + courseId unique).
      const [dup] = await tx
        .select({ id: electivePoolCourses.id })
        .from(electivePoolCourses)
        .where(
          and(
            eq(electivePoolCourses.poolId, poolId),
            eq(electivePoolCourses.courseId, courseId),
          ),
        )
        .limit(1);
      if (dup) {
        throw new ConflictException('Bu ders havuza zaten eklenmiş');
      }

      const [row] = await tx
        .insert(electivePoolCourses)
        .values({
          tenantId: ctx.tenantId,
          poolId,
          courseId,
        })
        .returning();
      return row!;
    });
  }
}
