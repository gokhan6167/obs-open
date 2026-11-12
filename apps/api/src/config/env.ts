import { z } from 'zod';

/**
 * Ortam değişkeni doğrulama. Sır YOK; hepsi env'den gelir (master prompt §5).
 * Uygulama, RLS'e tabi 'obs_app' rolüyle (DATABASE_URL) bağlanır; DDL/seed ise
 * süper rolle (DATABASE_MIGRATE_URL) yapılır. Bkz. ADR-0003.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEPLOYMENT_MODE: z.enum(['single-tenant', 'multi-tenant']).default('multi-tenant'),
    API_PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().url(),
    DATABASE_MIGRATE_URL: z.string().url(),

    // GÜVENLİK: gerçek auth (JWT) gelene kadar actor kimliği/rolleri başlıktan
    // okunabilir — SADECE bu bayrak açıkken. Yalnız literal 'true' açar
    // (z.coerce.boolean 'false' string'ini true yapardı; bilinçli enum kullanıldı).
    AUTH_STUB_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // JWT imza sırrı (üretimde güçlü rastgele; dev varsayılanı yalnız yerel).
    JWT_SECRET: z.string().default('dev-jwt-secret-change-in-prod'),
    JWT_TTL: z.string().default('12h'),

    TZ: z.string().default('Europe/Istanbul'),

    // İzlenebilirlik (Faz 9 boşluğu — pilotta ilk arızada kör kalmamak için).
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Sentry opsiyonel: DSN yoksa hata raporlama devre dışı (mock|live felsefesi,
    // pilot için zorunlu dış bağımlılık yaratmaz).
    SENTRY_DSN: z.string().url().optional(),
    // Hız sınırı — kaba kuvvet/gürültü koruması. TTL saniye; LIMIT o pencerede
    // izin verilen istek sayısı.
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(300),
  })
  // Auth stub üretimde ASLA açılamaz — açılırsa uygulama ayağa kalkmaz.
  .refine((env) => !(env.AUTH_STUB_ENABLED && env.NODE_ENV === 'production'), {
    message: 'AUTH_STUB_ENABLED production ortamında açılamaz (spoofable auth bypass)',
    path: ['AUTH_STUB_ENABLED'],
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues}`);
  }
  return parsed.data;
}
