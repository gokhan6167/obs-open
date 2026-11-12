import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { users } from '../db/schema.js';
import { photoRequests } from '../db/schema-missing.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/onay yetkisi (diploma.service STAFF ile bire bir).
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

export interface CreatePhotoInput {
  photoUrl: string;
}

export interface ReviewPhotoInput {
  status: 'onayli' | 'reddedildi';
}

/**
 * Fotoğraf onayı servisi (0018). Tenant-kapsamlı (RLS). Kullanıcı kendi fotoğraf
 * isteğini oluşturur; personel bekleyenleri görür ve onaylar/reddeder. Onaylanınca
 * ilgili kullanıcının users.photoUrl alanı güncellenir.
 */
@Injectable()
export class PhotoService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Beklemedeki fotoğraf istekleri; kullanıcı e-posta join, en yeni önce. */
  async pending(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Fotoğraf isteklerine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: photoRequests.id,
          userId: photoRequests.userId,
          userEmail: users.email,
          photoUrl: photoRequests.photoUrl,
          status: photoRequests.status,
          createdAt: photoRequests.createdAt,
        })
        .from(photoRequests)
        .innerJoin(users, eq(photoRequests.userId, users.id))
        .where(eq(photoRequests.status, 'beklemede'))
        .orderBy(desc(photoRequests.createdAt));
      return { items };
    });
  }

  /** Aktör kendi fotoğraf isteğini oluşturur (status beklemede). */
  async create(input: CreatePhotoInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new UnauthorizedException('Kimlik doğrulaması gerekli');
    }
    const actorUserId = ctx.actorUserId;
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(photoRequests)
        .values({
          tenantId: ctx.tenantId,
          userId: actorUserId,
          photoUrl: input.photoUrl,
          status: 'beklemede',
        })
        .returning();
      return row!;
    });
  }

  /**
   * Fotoğraf isteğini onayla/reddet (personel). reviewedByUserId = aktör.
   * Onaylıysa ilgili kullanıcının users.photoUrl alanı güncellenir.
   */
  async review(id: string, input: ReviewPhotoInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Fotoğraf isteği onaylama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(photoRequests)
        .set({ status: input.status, reviewedByUserId: ctx.actorUserId ?? null })
        .where(eq(photoRequests.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('Fotoğraf isteği bulunamadı');
      }

      if (input.status === 'onayli') {
        await tx
          .update(users)
          .set({ photoUrl: row.photoUrl })
          .where(eq(users.id, row.userId));
      }

      return row;
    });
  }
}
