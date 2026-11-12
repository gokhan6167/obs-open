import { defineConfig, devices } from '@playwright/test';

/**
 * E2E harness — demo-web kritik akış smoke testleri.
 *
 * BASE_URL ile hedef seçilir:
 *   - Varsayılan: canlı demo (obs-demo-chi.vercel.app) — READ-ONLY smoke güvenli.
 *   - Yerel: BASE_URL=http://localhost:3000 (önce `pnpm dev` + API + DB gerekir).
 *
 * NOT: Yazma akışları (ders seçme draft→submit, not itirazı kararı) canlı demo
 * verisini DEĞİŞTİRİR; bu yüzden @write etiketli testler yalnız yerelde koşmalı
 * (grep-invert ile canlıda hariç tutulur — aşağıdaki script'e bakın).
 */
const BASE_URL = process.env.BASE_URL ?? 'https://obs-demo-chi.vercel.app';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
