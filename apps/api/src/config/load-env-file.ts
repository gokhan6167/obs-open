import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repo kökündeki `.env` dosyasını (varsa) process.env'e yükler. Yoksa sessizce
 * geçer — CI ve prod ortam değişkenleri doğrudan verir (dosya yok). Node 24'ün
 * yerleşik loadEnvFile'ı kullanılır; ek bağımlılık yok.
 *
 * Standalone scriptler (migrate/seed) ve Nest bootstrap bunu loadEnv'den ÖNCE çağırır.
 */
export function loadEnvFile(): void {
  const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src/config
  const root = join(here, '..', '..', '..', '..'); // repo kökü
  const path = join(root, '.env');
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
