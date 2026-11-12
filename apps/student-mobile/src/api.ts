import { ObsClient } from '@obs/api-client';

/**
 * OBS API istemcisi (mobil). baseUrl/tenant yapılandırmadan; token gerçek auth
 * gelince eklenecek. Faz 10 iskeleti — auth stub başlıklarıyla.
 */
export function createClient(config: {
  baseUrl: string;
  tenantId: string;
  studentUserId: string;
}): ObsClient {
  return new ObsClient({
    baseUrl: config.baseUrl,
    tenantId: config.tenantId,
    actorUserId: config.studentUserId,
    roles: ['ogrenci'],
  });
}
