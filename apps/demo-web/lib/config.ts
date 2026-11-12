// Canlı OBS API (obs-api) + Demo tenant. Sır DEĞİL — tenant UUID herkese açıktır.
// Prod varsayılanları gömülü; istenirse NEXT_PUBLIC_* ile override edilir.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://obs-api-seven.vercel.app/api/v1';
export const TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID ?? 'cea5d232-02e8-4a2d-b739-901c361a067b';
