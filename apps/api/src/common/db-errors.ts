/**
 * Postgres hata kodu tespiti.
 *
 * Neden zincir yürüyoruz: Drizzle sürücü hatasını kendi hata nesnesine sarabiliyor
 * (`cause` içinde asıl PostgresError). Yalnızca `e.code`'a bakmak, unique ihlalini
 * kaçırıp 500 döndürüyordu (canlıda görüldü: aynı bina kodu → 500, 409 olmalı).
 */
export function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** 23505 = unique_violation */
export const isUniqueViolation = (e: unknown): boolean => pgErrorCode(e) === '23505';

/** 23503 = foreign_key_violation */
export const isForeignKeyViolation = (e: unknown): boolean => pgErrorCode(e) === '23503';
