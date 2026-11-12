import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Audit her modülden erişilebilir olmalı -> global. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
