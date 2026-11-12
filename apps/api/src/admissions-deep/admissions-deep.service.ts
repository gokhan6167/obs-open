import { randomInt } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { programs } from '../db/schema-academic.js';
import { applicationDocuments, externalServiceLogs } from '../db/schema-admissions-deep.js';
import { applicants, applicationPrograms } from '../db/schema-backoffice.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ADMISSIONS_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/yazma yetkisi (admissions.service STAFF ile bire bir).
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

export interface CreateDocumentInput {
  kind: string;
  fileName?: string | undefined;
  fileUrl?: string | undefined;
}

export interface ExternalQueryInput {
  operation: string;
  subjectRef: string;
}

/** Deterministik sahte veri üretimi için basit gövde hash'i (kriptografik DEĞİL). */
function hashOf(input: string): number {
  let h = 7;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) % 1_000_000_007;
  }
  return h;
}

const MOCK_ADLAR = ['Ahmet', 'Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Can', 'Merve'];
const MOCK_SOYADLAR = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Arslan', 'Doğan'];
const MOCK_YOKSIS_DURUM = ['aktif', 'kayitli_degil', 'mezun', 'kayit_dondurdu'];

/**
 * MOCK dış servis yanıtı. Gerçek çağrı YOK; aynı (service, operation, subjectRef)
 * için her zaman aynı yanıtı üretir. Yanıt `_mock: true` ile işaretlenir.
 */
function mockResponse(
  service: string,
  operation: string,
  subjectRef: string,
): Record<string, unknown> {
  const h = hashOf(`${service}|${operation}|${subjectRef}`);
  const base = { _mock: true, service, operation, subjectRef };
  switch (service) {
    case 'mernis': {
      const gun = (h % 28) + 1;
      const ay = (h % 12) + 1;
      const yil = 1985 + (h % 25);
      return {
        ...base,
        ad: MOCK_ADLAR[h % MOCK_ADLAR.length],
        soyad: MOCK_SOYADLAR[(h >> 3) % MOCK_SOYADLAR.length],
        dogumTarihi: `${yil}-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`,
      };
    }
    case 'osym':
      return {
        ...base,
        puan: Number((200 + (h % 30_000) / 100).toFixed(2)),
        yerlestirmeKodu: String(100_000_000 + (h % 899_999_999)),
      };
    case 'yoksis':
      return {
        ...base,
        ogrenciNo: String(20_000_000 + (h % 9_999_999)),
        durum: MOCK_YOKSIS_DURUM[h % MOCK_YOKSIS_DURUM.length],
      };
    case 'sgk':
      return {
        ...base,
        sicilNo: String(1_000_000 + (h % 8_999_999)),
        calisiyorMu: h % 2 === 0,
        isyeriKodu: `IY-${String(h % 100_000).padStart(5, '0')}`,
      };
    default:
      return { ...base, sonuc: 'bilinmeyen_servis' };
  }
}

/**
 * Başvuru/kabul derinliği (0021) servisi: aday PIN'i, PIN ile durum sorgulama,
 * başvuru belgeleri, yerleştirme (sıralama) ve MOCK dış servis logları.
 * Tenant-kapsamlı (RLS); PIN sorgusu dışındaki tüm uçlar personel yetkisi ister.
 */
@Injectable()
export class AdmissionsDeepService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aday için rastgele 8 haneli PIN üretip kaydeder (personel + audit). */
  async issuePin(applicantId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Aday PIN üretme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: applicants.id })
        .from(applicants)
        .where(eq(applicants.id, applicantId))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Başvuran bulunamadı');
      }

      // Tenant içinde çakışmayan bir PIN bul (birkaç deneme yeter).
      let pin = '';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = String(randomInt(10_000_000, 100_000_000));
        const [clash] = await tx
          .select({ id: applicants.id })
          .from(applicants)
          .where(eq(applicants.pinCode, candidate))
          .limit(1);
        if (!clash) {
          pin = candidate;
          break;
        }
      }
      if (!pin) {
        pin = String(randomInt(10_000_000, 100_000_000));
      }

      const [row] = await tx
        .update(applicants)
        .set({ pinCode: pin })
        .where(eq(applicants.id, applicantId))
        .returning({ id: applicants.id, fullName: applicants.fullName, pinCode: applicants.pinCode });

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.applicant.pin',
        resourceType: 'applicant',
        resourceId: applicantId,
        // PIN audit'e YAZILMAZ (hassas); yalnızca üretildiği bilgisi tutulur.
        diff: { issued: true },
      });

      return row!;
    });
  }

  /**
   * PIN + TC ile aday durum sorgulama. Personel şartı YOK (aday self-servis).
   * Bilerek DAR alan seti döner; eşleşme yoksa 404 (hangi alanın yanlış
   * olduğu sızdırılmaz).
   */
  async track(pin: string, nationalId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          fullName: applicants.fullName,
          programName: programs.name,
          status: applicants.status,
          score: applicants.score,
          preferenceNo: applicants.preferenceNo,
        })
        .from(applicants)
        .innerJoin(
          applicationPrograms,
          eq(applicants.applicationProgramId, applicationPrograms.id),
        )
        .innerJoin(programs, eq(applicationPrograms.programId, programs.id))
        .where(and(eq(applicants.pinCode, pin), eq(applicants.nationalId, nationalId)))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Başvuru bulunamadı');
      }
      return row;
    });
  }

  /** Adayın başvuru belgeleri (personel). */
  async listDocuments(applicantId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Başvuru belgelerine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: applicationDocuments.id,
          applicantId: applicationDocuments.applicantId,
          kind: applicationDocuments.kind,
          fileName: applicationDocuments.fileName,
          fileUrl: applicationDocuments.fileUrl,
          verified: applicationDocuments.verified,
          createdAt: applicationDocuments.createdAt,
        })
        .from(applicationDocuments)
        .where(eq(applicationDocuments.applicantId, applicantId))
        .orderBy(desc(applicationDocuments.createdAt));
      return { items };
    });
  }

  /** Adaya başvuru belgesi ekle (personel + audit). */
  async createDocument(
    applicantId: string,
    input: CreateDocumentInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Başvuru belgesi ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [applicant] = await tx
        .select({ id: applicants.id })
        .from(applicants)
        .where(eq(applicants.id, applicantId))
        .limit(1);
      if (!applicant) {
        throw new NotFoundException('Başvuran bulunamadı');
      }

      const [row] = await tx
        .insert(applicationDocuments)
        .values({
          tenantId: ctx.tenantId,
          applicantId,
          kind: input.kind,
          fileName: input.fileName ?? null,
          fileUrl: input.fileUrl ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.document.create',
        resourceType: 'application_document',
        resourceId: row!.id,
        diff: { applicantId, kind: input.kind },
      });

      return row!;
    });
  }

  /** Belge doğrulama durumunu güncelle (personel + audit). */
  async verifyDocument(docId: string, verified: boolean): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Belge doğrulama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: applicationDocuments.id })
        .from(applicationDocuments)
        .where(eq(applicationDocuments.id, docId))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Belge bulunamadı');
      }

      const [row] = await tx
        .update(applicationDocuments)
        .set({ verified })
        .where(eq(applicationDocuments.id, docId))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.document.verify',
        resourceType: 'application_document',
        resourceId: docId,
        diff: { verified },
      });

      return row!;
    });
  }

  /**
   * Yerleştirme: başvuru programının adaylarını puana göre (DESC, puansızlar
   * en sonda) sıralar; kontenjan kadarı "kazandi", kalanı "kazanamadi" olur.
   * Puanı olmayan aday her hâlükârda "kazanamadi".
   */
  async rank(applicationProgramId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Yerleştirme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [ap] = await tx
        .select({ id: applicationPrograms.id, quota: applicationPrograms.quota })
        .from(applicationPrograms)
        .where(eq(applicationPrograms.id, applicationProgramId))
        .limit(1);
      if (!ap) {
        throw new NotFoundException('Başvuru programı bulunamadı');
      }

      const rows = await tx
        .select({ id: applicants.id, score: applicants.score })
        .from(applicants)
        .where(eq(applicants.applicationProgramId, applicationProgramId))
        .orderBy(sql`${applicants.score} desc nulls last`, applicants.createdAt);

      let placed = 0;
      for (const row of rows) {
        const wins = row.score !== null && placed < ap.quota;
        if (wins) {
          placed += 1;
        }
        await tx
          .update(applicants)
          .set({ status: wins ? 'kazandi' : 'kazanamadi' })
          .where(eq(applicants.id, row.id));
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.program.rank',
        resourceType: 'application_program',
        resourceId: applicationProgramId,
        diff: { quota: ap.quota, updated: rows.length, placed },
      });

      return { updated: rows.length, placed, quota: ap.quota };
    });
  }

  /** Dış servis çağrı logları; opsiyonel ?service filtresi (personel). */
  async listExternalLogs(service?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Dış servis loglarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = service ? eq(externalServiceLogs.service, service) : undefined;
      const items = await tx
        .select({
          id: externalServiceLogs.id,
          service: externalServiceLogs.service,
          operation: externalServiceLogs.operation,
          subjectRef: externalServiceLogs.subjectRef,
          status: externalServiceLogs.status,
          response: externalServiceLogs.response,
          createdAt: externalServiceLogs.createdAt,
        })
        .from(externalServiceLogs)
        .where(where)
        .orderBy(desc(externalServiceLogs.createdAt));
      return { items };
    });
  }

  /**
   * MOCK dış servis sorgusu (mernis/osym/yoksis/sgk). Gerçek entegrasyon YOK;
   * deterministik sahte yanıt üretilir, loglanır ve `_mock: true` ile döner.
   */
  async externalQuery(
    service: string,
    input: ExternalQueryInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Dış servis sorgulama yetkiniz yok');
    }
    const response = mockResponse(service, input.operation, input.subjectRef);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(externalServiceLogs)
        .values({
          tenantId: ctx.tenantId,
          service,
          operation: input.operation,
          subjectRef: input.subjectRef,
          status: 'basarili',
          response,
        })
        .returning({ id: externalServiceLogs.id, createdAt: externalServiceLogs.createdAt });

      return { logId: row!.id, createdAt: row!.createdAt, response };
    });
  }
}
