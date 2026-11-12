import 'reflect-metadata';
// ÖNCE .env yüklensin (AppModule/ConfigModule değerlendirilmeden). Sıra önemli.
import './config/env-bootstrap.js';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { initSentry } from './observability/sentry.js';

async function bootstrap(): Promise<void> {
  // bufferLogs: pino hazır olana kadar bootstrap loglarını tut, sonra boşalt.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  // Sentry opsiyonel (DSN yoksa no-op). Erken init: runtime hataları raporlansın.
  initSentry(config.get<string>('SENTRY_DSN'), config.getOrThrow<string>('NODE_ENV'));

  // Güvenlik başlıkları. Swagger UI'ı bozmamak için CSP/COEP kapalı.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  app.setGlobalPrefix('api/v1');

  // OpenAPI 3 sözleşmesi -> /api/v1/docs
  const openapi = new DocumentBuilder()
    .setTitle('OBS API')
    .setDescription('Üniversite Öğrenci Bilgi Sistemi — REST API v1')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, openapi));

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  app.get(Logger).log(`OBS api hazır: http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((err: unknown) => {
  console.error('Bootstrap hatası:', err);
  process.exitCode = 1;
});
