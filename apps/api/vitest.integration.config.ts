import { defineConfig } from 'vitest/config';

/**
 * Entegrasyon testleri (gerçek Postgres'e bağlanır, ör. RLS izolasyonu).
 * `pnpm db:migrate` SONRASI çalışır. Seri koşar (paylaşılan DB).
 */
export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
