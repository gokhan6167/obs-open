import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { FacilitiesService } from './facilities.service.js';

const createBuildingSchema = z.object({
  code: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  campus: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
});
type CreateBuildingDto = z.infer<typeof createBuildingSchema>;

const createClassroomSchema = z.object({
  buildingId: z.string().uuid(),
  code: z.string().min(1).max(120),
  name: z.string().max(200).optional(),
  kind: z.string().min(1).max(120),
  capacity: z.number().int().min(0),
});
type CreateClassroomDto = z.infer<typeof createClassroomSchema>;

@ApiTags('facilities')
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly service: FacilitiesService) {}

  @Get('buildings')
  @ApiOperation({ summary: 'Bina listesi (personel)' })
  listBuildings() {
    return this.service.listBuildings();
  }

  @Post('buildings')
  @ApiOperation({ summary: 'Bina oluştur (personel)' })
  createBuilding(@Body(new ZodValidationPipe(createBuildingSchema)) body: CreateBuildingDto) {
    return this.service.createBuilding(body);
  }

  @Get('classrooms')
  @ApiOperation({ summary: 'Derslik listesi (opsiyonel ?buildingId; bina adı join)' })
  listClassrooms(@Query('buildingId') buildingId?: string) {
    return this.service.listClassrooms(buildingId);
  }

  @Post('classrooms')
  @ApiOperation({ summary: 'Derslik oluştur (personel)' })
  createClassroom(@Body(new ZodValidationPipe(createClassroomSchema)) body: CreateClassroomDto) {
    return this.service.createClassroom(body);
  }
}
