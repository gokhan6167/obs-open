import * as Sentry from '@sentry/node';

/**
 * Sentry — OPSİYONEL hata raporlama. DSN yoksa hiçbir şey yapmaz (mock|live
 * felsefesi: pilot için zorunlu dış bağımlılık yaratmayız). init yalnızca bir
 * kez, main.ts bootstrap'ında çağrılır.
 */
let enabled = false;

export function initSentry(dsn: string | undefined, environment: string): void {
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment,
    // PII göndermeyiz; hata bağlamını filter zaten maskeli setContext ile ekler.
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  enabled = true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

/** 5xx'leri raporla. Bağlam (tenant/rota) PII içermeyecek şekilde eklenir. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('istek', context);
    }
    Sentry.captureException(err);
  });
}
