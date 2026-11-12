import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { currentTenant } from '../db/tenant-context.js';
import { captureError } from '../observability/sentry.js';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Tüm istisnaları tek zarfa toplayan GLOBAL filtre (Faz 9 boşluğu).
 *
 * - HttpException'lar durum + mesajını korur (409/403/400 akışları bozulmaz).
 * - 5xx'ler `error` seviyesinde tenant/rota bağlamıyla loglanır ve (DSN varsa)
 *   Sentry'ye raporlanır — pilotta arıza kör kalmaz.
 * - 4xx'ler `debug` seviyesinde loglanır (gürültü yapmadan iz bırakır).
 * - Beklenmeyen (HttpException olmayan) hataların iç detayı istemciye SIZMAZ;
 *   yalnız jenerik 500 mesajı döner (bilgi ifşası önlenir).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const req = http.getRequest<{ method?: string; url?: string; originalUrl?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // HttpException gövdesindeki mesajı koru (ValidationPipe dizi mesajları dahil).
    let message: string | string[] = 'Beklenmeyen bir hata oluştu.';
    let error = 'Internal Server Error';
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? exception.message;
        error = b.error ?? error;
      }
    }

    const path = req.originalUrl ?? req.url ?? '';
    const ctx = currentTenant();
    const logMeta = {
      status,
      method: req.method,
      path,
      tenantId: ctx?.tenantId,
      actorUserId: ctx?.actorUserId,
    };

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${path} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
        JSON.stringify(logMeta),
      );
      captureError(exception, logMeta);
    } else {
      this.logger.debug(`${req.method} ${path} -> ${status} ${JSON.stringify(message)}`);
    }

    const envelope: ErrorEnvelope = {
      statusCode: status,
      error,
      message,
      path,
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(envelope);
  }
}
