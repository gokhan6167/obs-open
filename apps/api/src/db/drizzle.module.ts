import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb, type DbHandle } from './client.js';

/** DI token — DbHandle (client + drizzle db). */
export const DB = Symbol('OBS_DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DbHandle => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return createDb(url);
      },
    },
  ],
  exports: [DB],
})
export class DrizzleModule {}
