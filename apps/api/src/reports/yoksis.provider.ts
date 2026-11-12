import { Injectable } from '@nestjs/common';

/**
 * YÖKSİS bildirim adaptörü (M9). Resmi web servis protokolü üniversite üzerinden
 * gelir; şimdilik arayüz + mock (§4 deseni). Kayıt/mezuniyet bildirimleri buradan.
 */
export interface YoksisEnrollmentRecord {
  studentNo: string;
  programCode: string;
  status: string;
}

export interface YoksisProvider {
  reportEnrollments(records: readonly YoksisEnrollmentRecord[]): Promise<{ accepted: number }>;
}

export const YOKSIS_PROVIDER = Symbol('YOKSIS_PROVIDER');

/** Dev mock — kayıtları kabul eder (gerçek gönderim yok). */
@Injectable()
export class MockYoksisProvider implements YoksisProvider {
  reportEnrollments(records: readonly YoksisEnrollmentRecord[]): Promise<{ accepted: number }> {
    return Promise.resolve({ accepted: records.length });
  }
}
