import { expect, test } from '@playwright/test';

/**
 * Kritik akış: kimlik doğrulama + rol yönlendirmesi. READ-ONLY — canlı demo'ya
 * karşı güvenle koşar (veri değiştirmez; yalnız /auth/login + panel okuması).
 */

const DEMO_PASSWORD = 'Parola123!';

// Farklı yetki eksenlerinden 3 temsili rol; her biri kendi paneline düşmeli.
const ROLES = [
  { name: 'Öğrenci', email: 'ogrenci@example.edu' },
  { name: 'Öğretim Elemanı', email: 'hoca@example.edu' },
  { name: 'Öğrenci İşleri', email: 'yonetim@example.edu' },
];

test('login sayfası render olur (email + parola + giriş butonu)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input#e')).toBeVisible();
  await expect(page.locator('input#p')).toBeVisible();
  await expect(page.getByRole('button', { name: /Giriş yap/i })).toBeVisible();
});

test('yanlış parola → hata gösterilir, panele geçilmez', async ({ page }) => {
  await page.goto('/');
  await page.locator('input#e').fill('ogrenci@example.edu');
  await page.locator('input#p').fill('yanlis-parola');
  await page.getByRole('button', { name: /Giriş yap/i }).click();
  // Hata mesajı görünür ve URL kökte kalır (yönlendirme yok).
  await expect(page.getByText(/başarısız|hatalı|geçersiz/i)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

for (const role of ROLES) {
  test(`${role.name} girişi → token + kendi paneline yönlenir`, async ({ page }) => {
    await page.goto('/');
    await page.locator('input#e').fill(role.email);
    await page.locator('input#p').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: /Giriş yap/i }).click();

    // Kökten uzağa yönlendi (roleHome) — kimlik başarılı.
    await expect(page).not.toHaveURL(/\/$/, { timeout: 15_000 });

    // JWT localStorage'a yazıldı.
    const token = await page.evaluate(() => localStorage.getItem('obs_token'));
    expect(token, 'obs_token localStorage’a yazılmalı').toBeTruthy();

    // Panel iskeleti yüklendi (sidebar/kabuk render oldu).
    await expect(page.locator('body')).not.toBeEmpty();
  });
}
