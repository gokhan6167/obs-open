import { randomInt, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { documentSignatures } from '../db/schema-integrations.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (approval.service STAFF ile bire bir).
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

const BEKLIYOR = 'bekliyor';
const IMZALANDI = 'imzalandi';
const REDDEDILDI = 'reddedildi';

export interface SignerInput {
  signerUserId?: string | undefined;
  signerName?: string | undefined;
}

export interface CreateSignatureInput {
  subjectType: string;
  subjectId?: string | undefined;
  title: string;
  signers: SignerInput[];
}

export interface SignInput {
  note?: string | undefined;
}

export interface RejectInput {
  note: string;
}

/** EBYS referansı: EBYS-<yıl>-<6 hane>. Kriptografik rastgelelik (Math.random değil). */
function makeEbysRef(): string {
  return `EBYS-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

/**
 * EBYS / e-imza akışı (0025). Bir belge için imzacılar seq 1..N ile zincire
 * dizilir; imza SIRALIDIR: bir imzacı ancak kendinden önceki tüm seq'ler
 * imzalanmışsa imzalayabilir. Tenant-kapsamlı (RLS); zincir oluşturma personel
 * yetkisi ister, imzalama/red yalnızca ilgili imzacıya açıktır.
 */
@Injectable()
export class SignatureService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** İmza kayıtları (personel); ?status,?subjectType; imzalayan e-postası join. */
  async list(status?: string, subjectType?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('İmza kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (status) conds.push(eq(documentSignatures.status, status));
      if (subjectType) conds.push(eq(documentSignatures.subjectType, subjectType));
      const items = await tx
        .select(this.columns())
        .from(documentSignatures)
        .leftJoin(users, eq(documentSignatures.signerUserId, users.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(documentSignatures.createdAt), asc(documentSignatures.seq));
      return { items };
    });
  }

  /**
   * Aktörün imzasını bekleyen belgeler: imzacı aktör, durum bekliyor VE aynı
   * belgede daha küçük seq'lerin tamamı imzalanmış (sıra gerçekten aktörde).
   * Önceki bir imzacı reddettiyse zincir durur, kayıt burada listelenmez.
   */
  async pending(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const actor = ctx.actorUserId;
    if (!actor) {
      throw new ForbiddenException('İmza kuyruğu için kimlik doğrulaması gerekli');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // subject_id NULL olabildiği için karşılaştırma `is not distinct from` ile.
      const chainReady = sql`not exists (
        select 1 from document_signatures p
        where p.tenant_id = ${documentSignatures.tenantId}
          and p.subject_type = ${documentSignatures.subjectType}
          and p.subject_id is not distinct from ${documentSignatures.subjectId}
          and p.seq < ${documentSignatures.seq}
          and p.status <> ${IMZALANDI}
      )`;

      const items = await tx
        .select(this.columns())
        .from(documentSignatures)
        .leftJoin(users, eq(documentSignatures.signerUserId, users.id))
        .where(
          and(
            eq(documentSignatures.signerUserId, actor),
            eq(documentSignatures.status, BEKLIYOR),
            chainReady,
          ),
        )
        .orderBy(asc(documentSignatures.createdAt));
      return { items };
    });
  }

  /** İmza zinciri oluştur (personel): her imzacı için seq 1..N satırı. */
  async create(input: CreateSignatureInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('İmza zinciri oluşturma yetkiniz yok');
    }
    const chainId = input.subjectId ?? randomUUID();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .insert(documentSignatures)
        .values(
          input.signers.map((s, i) => ({
            tenantId: ctx.tenantId,
            subjectType: input.subjectType,
            // Zincir kimliği: subjectId verilmezse zincire özel kimlik üretilir.
            // Aksi halde subject_id=NULL olan TÜM zincirler tek zincir gibi
            // davranır ve sıralı-imza kontrolü birbirini bloklar.
            subjectId: chainId,
            title: input.title,
            signerUserId: s.signerUserId ?? null,
            signerName: s.signerName ?? null,
            seq: i + 1,
            status: BEKLIYOR,
          })),
        )
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'signature.chain.create',
        resourceType: 'document_signature',
        resourceId: rows[0]!.id,
        diff: {
          subjectType: input.subjectType,
          subjectId: input.subjectId ?? null,
          title: input.title,
          signerCount: rows.length,
        },
      });

      return { items: rows };
    });
  }

  /**
   * İmzala. Yalnızca satırın imzacısı (403); zincirde önceki seq'lerden biri
   * hâlâ imzalanmadıysa 409. İmzada ebysRef otomatik üretilir.
   */
  async sign(id: string, input: SignInput): Promise<Record<string, unknown>> {
    return this.decide(id, IMZALANDI, input.note);
  }

  /** Reddet. Yalnızca satırın imzacısı; gerekçe zorunlu. Zincir burada durur. */
  async reject(id: string, input: RejectInput): Promise<Record<string, unknown>> {
    return this.decide(id, REDDEDILDI, input.note);
  }

  /** Belgenin sıralı imza zinciri (durumlarıyla). */
  async chain(subjectType: string, subjectId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select(this.columns())
        .from(documentSignatures)
        .leftJoin(users, eq(documentSignatures.signerUserId, users.id))
        .where(
          and(
            eq(documentSignatures.subjectType, subjectType),
            eq(documentSignatures.subjectId, subjectId),
          ),
        )
        .orderBy(asc(documentSignatures.seq));
      if (!rows.length) {
        throw new NotFoundException('Bu belge için imza kaydı yok');
      }

      // Zinciri görebilenler: personel veya zincirdeki imzacılardan biri.
      const staff = isStaff(ctx.roles ?? []);
      if (!staff && !rows.some((r) => r.signerUserId && r.signerUserId === ctx.actorUserId)) {
        throw new ForbiddenException('Bu belgenin imza zincirine erişim yetkiniz yok');
      }
      // Personel dışına imzacı e-postası ve iç not sızdırılmaz.
      const items = staff ? rows : rows.map(({ signerEmail: _e, note: _n, ...rest }) => rest);

      const pendingSeq = rows.find((r) => r.status === BEKLIYOR)?.seq ?? null;
      const rejected = rows.some((r) => r.status === REDDEDILDI);
      const status = rejected
        ? REDDEDILDI
        : rows.every((r) => r.status === IMZALANDI)
          ? 'tamamlandi'
          : 'devam';

      return { subjectType, subjectId, title: rows[0]!.title, status, pendingSeq, items };
    });
  }

  /** sign/reject ortak gövdesi: sahiplik + sıra kontrolü, sonra durum yazımı. */
  private async decide(
    id: string,
    status: typeof IMZALANDI | typeof REDDEDILDI,
    note?: string,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const actor = ctx.actorUserId;
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(documentSignatures)
        .where(eq(documentSignatures.id, id))
        .limit(1);
      if (!row) {
        throw new NotFoundException('İmza kaydı bulunamadı');
      }
      // Vekaleten imza yok: satır kimdeyse yalnızca o kişi karara bağlar.
      if (!actor || row.signerUserId !== actor) {
        throw new ForbiddenException('Bu imza kaydı size ait değil');
      }
      if (row.status !== BEKLIYOR) {
        throw new ConflictException('Bu imza kaydı zaten karara bağlanmış');
      }

      // Sıralı imza: önceki seq'lerden biri imzalanmamışsa sıra aktörde değildir.
      const [blocker] = await tx
        .select({ seq: documentSignatures.seq })
        .from(documentSignatures)
        .where(
          and(
            eq(documentSignatures.subjectType, row.subjectType),
            row.subjectId
              ? eq(documentSignatures.subjectId, row.subjectId)
              : isNull(documentSignatures.subjectId),
            sql`${documentSignatures.seq} < ${row.seq}`,
            sql`${documentSignatures.status} <> ${IMZALANDI}`,
          ),
        )
        .orderBy(asc(documentSignatures.seq))
        .limit(1);
      if (blocker) {
        throw new ConflictException('Sıra sizde değil');
      }

      const signed = status === IMZALANDI;
      const [updated] = await tx
        .update(documentSignatures)
        .set({
          status,
          signedAt: signed ? new Date() : null,
          ebysRef: signed ? makeEbysRef() : null,
          note: note ?? null,
        })
        .where(eq(documentSignatures.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: actor,
        action: signed ? 'signature.sign' : 'signature.reject',
        resourceType: 'document_signature',
        resourceId: id,
        diff: {
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          seq: row.seq,
          status,
          ebysRef: updated!.ebysRef,
        },
      });

      return updated!;
    });
  }

  /** Liste/zincir uçlarının ortak kolon seti (imzacı e-postası join'li). */
  private columns() {
    return {
      id: documentSignatures.id,
      subjectType: documentSignatures.subjectType,
      subjectId: documentSignatures.subjectId,
      title: documentSignatures.title,
      signerUserId: documentSignatures.signerUserId,
      signerName: documentSignatures.signerName,
      signerEmail: users.email,
      seq: documentSignatures.seq,
      status: documentSignatures.status,
      signedAt: documentSignatures.signedAt,
      ebysRef: documentSignatures.ebysRef,
      note: documentSignatures.note,
      createdAt: documentSignatures.createdAt,
    };
  }
}
