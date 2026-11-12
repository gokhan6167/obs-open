import { Global, Module } from '@nestjs/common';
import { ParametersService } from './parameters.service.js';

/** Parametre çözümleme her akademik modülden gerekli -> global. */
@Global()
@Module({
  providers: [ParametersService],
  exports: [ParametersService],
})
export class ParametersModule {}
