import { Module } from '@nestjs/common';
import { PhotoController } from './photo.controller.js';
import { PhotoService } from './photo.service.js';

@Module({
  controllers: [PhotoController],
  providers: [PhotoService],
})
export class PhotoModule {}
