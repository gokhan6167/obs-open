import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { FACILITIES_ADMIN, hasRole } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { buildings, classrooms } from '../db/schema-backoffice.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { isUniqueViolation } from '../common/db-errors.js';

// Personel okuma yetkisi (discipline/students STAFF ile bire bir). Yazma FACILITIES_ADMIN.
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

export interface CreateBuildingInput {
  code: string;
  name: string;
  campus?: string | undefined;
  address?: string | undefined;
}

export interface CreateClassroomInput {
  buildingId: string;
  code: string;
  name?: string | undefined;
  kind: string;
  capacity: number;
}

/**
 * Derslik/bina servisi (0015 backoffice). Tenant-kapsamlı (RLS), personel
 * yetkisi in-service kontrol edilir.
 */
@Injectable()
export class FacilitiesService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Bina listesi (personel). */
  async listBuildings(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Bina kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: buildings.id,
          code: buildings.code,
          name: buildings.name,
          campus: buildings.campus,
          address: buildings.address,
          active: buildings.active,
          createdAt: buildings.createdAt,
        })
        .from(buildings)
        .orderBy(asc(buildings.code));
      return { items };
    });
  }

  /** Bina oluştur (tesis yönetimi). Aynı kod tenant içinde tekildir. */
  async createBuilding(input: CreateBuildingInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, FACILITIES_ADMIN)) {
      throw new ForbiddenException('Bina oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      try {
        const [row] = await tx
          .insert(buildings)
          .values({
            tenantId: ctx.tenantId,
            code: input.code,
            name: input.name,
            campus: input.campus ?? null,
            address: input.address ?? null,
          })
          .returning();
        return row!;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException('Bu kodla bir bina zaten var');
        }
        throw e;
      }
    });
  }

  /** Derslik listesi; opsiyonel bina filtresi, bina adı join. */
  async listClassrooms(buildingId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Derslik kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = buildingId ? eq(classrooms.buildingId, buildingId) : undefined;
      const items = await tx
        .select({
          id: classrooms.id,
          buildingId: classrooms.buildingId,
          buildingCode: buildings.code,
          buildingName: buildings.name,
          code: classrooms.code,
          name: classrooms.name,
          kind: classrooms.kind,
          capacity: classrooms.capacity,
          createdAt: classrooms.createdAt,
        })
        .from(classrooms)
        .innerJoin(buildings, eq(classrooms.buildingId, buildings.id))
        .where(where)
        .orderBy(asc(classrooms.code));
      return { items };
    });
  }

  /** Derslik oluştur (tesis yönetimi). Bina varlığı doğrulanır. */
  async createClassroom(input: CreateClassroomInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, FACILITIES_ADMIN)) {
      throw new ForbiddenException('Derslik oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [building] = await tx
        .select({ id: buildings.id })
        .from(buildings)
        .where(eq(buildings.id, input.buildingId))
        .limit(1);
      if (!building) {
        throw new NotFoundException('Bina bulunamadı');
      }

      const [row] = await tx
        .insert(classrooms)
        .values({
          tenantId: ctx.tenantId,
          buildingId: input.buildingId,
          code: input.code,
          name: input.name ?? null,
          kind: input.kind,
          capacity: input.capacity,
        })
        .returning();
      return row!;
    });
  }
}
