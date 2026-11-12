import { Module } from '@nestjs/common';
import { SignatureController } from './signature.controller.js';
import { SignatureService } from './signature.service.js';

@Module({
  controllers: [SignatureController],
  providers: [SignatureService],
  exports: [SignatureService],
})
export class SignatureModule {}
