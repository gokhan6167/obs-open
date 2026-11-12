import { Injectable } from '@nestjs/common';

/**
 * SGK staj giriş bildirimi adaptörü (M7). Gerçek SGK entegrasyonu/veri formatı
 * üniversite üzerinden gelir; şimdilik arayüz + mock (§4 deseni).
 */
export interface SgkEntryRecord {
  studentNo: string;
  siteName: string;
  startsOn: string;
  endsOn: string;
}

export interface SgkProvider {
  generateEntries(records: readonly SgkEntryRecord[]): Promise<{ generated: number; format: string }>;
}

export const SGK_PROVIDER = Symbol('SGK_PROVIDER');

@Injectable()
export class MockSgkProvider implements SgkProvider {
  generateEntries(
    records: readonly SgkEntryRecord[],
  ): Promise<{ generated: number; format: string }> {
    return Promise.resolve({ generated: records.length, format: 'sgk-mock-v1' });
  }
}
