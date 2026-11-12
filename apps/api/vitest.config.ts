import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    // Entegrasyon testleri (DB gerektiren) varsayılan `test`'ten HARİÇ tutulur;
    // ayrı config ile (test:isolation) migrate sonrası koşar.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts'],
  },
});
