import 'reflect-metadata';
// ÖNCE .env (varsa) yüklensin — AppModule/ConfigModule değerlendirilmeden.
import './config/env-bootstrap.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type Express } from 'express';
import { AppModule } from './app.module.js';

/**
 * Vercel serverless giriş noktası. NestJS uygulamasını Express adapter ile bir
 * kez ayağa kaldırır (listen ETMEZ) ve invocation'lar arası önbelleğe alır.
 * DDL/derleme yok: DI metadata'sı önceden `tsc` ile derlenmiş dist'ten gelir.
 */
let cached: Express | undefined;

async function createApp(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  // Frontend farklı origin'den çağırır; login öncesi tenant başlığı gerekir.
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
    credentials: false,
  });

  const openapi = new DocumentBuilder()
    .setTitle('OBS API')
    .setDescription('Üniversite Öğrenci Bilgi Sistemi — REST API v1')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, openapi));

  await app.init();
  return server;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!cached) {
    cached = await createApp();
  }
  cached(req, res);
}
