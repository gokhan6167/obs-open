import { Module } from '@nestjs/common';
import { AlumniController } from './alumni.controller.js';
import { AlumniService } from './alumni.service.js';
import { ExchangeController } from './exchange.controller.js';
import { ExchangeService } from './exchange.service.js';

@Module({
  controllers: [AlumniController, ExchangeController],
  providers: [AlumniService, ExchangeService],
})
export class AlumniExchangeModule {}
