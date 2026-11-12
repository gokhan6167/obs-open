import { Module } from '@nestjs/common';
import { GradesModule } from '../grades/grades.module.js';
import { DocumentsController, PublicVerifyController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { PdfService } from './pdf.service.js';

@Module({
  imports: [GradesModule], // GpaService
  controllers: [DocumentsController, PublicVerifyController],
  providers: [DocumentsService, PdfService],
})
export class DocumentsModule {}
