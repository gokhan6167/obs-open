import { z } from 'zod';

/**
 * Kullanıcıdan gelen URL'ler için http(s) şema allowlist'i.
 *
 * Neden `z.string().url()` yetmiyor: zod'un `.url()` kontrolü `new URL()` tabanlı
 * olduğu için `javascript:alert(1)` ve `data:text/html,...` gibi değerleri GEÇERLİ
 * sayar. Bu değerler bir anchor href'ine (veya img src'ine) yazıldığında XSS'e
 * dönüşür. Bu yüzden şema düzeyinde yalnızca http/https kabul edilir.
 *
 * Frontend tarafında da render öncesi aynı kontrol yapılır (çift kilit).
 */
export const httpUrl = (max = 1000) =>
  z
    .string()
    .max(max)
    .refine((u) => /^https?:\/\//i.test(u), {
      message: 'URL http:// veya https:// ile başlamalıdır',
    });
