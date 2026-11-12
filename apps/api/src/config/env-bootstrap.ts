import { loadEnvFile } from './load-env-file.js';

/**
 * YAN ETKİ MODÜLÜ — main.ts'te AppModule'den ÖNCE import edilir. ESM import'ları
 * hoist edildiğinden, ConfigModule.forRoot'un anında çalışan validate'i .env
 * yüklenmeden tetiklenmesin diye .env burada (import sırasında) yüklenir.
 */
loadEnvFile();
