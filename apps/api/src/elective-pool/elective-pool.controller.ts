import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { ElectivePoolService } from './elective-pool.service.js';

const createPoolSchema = z.object({
  code: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  kind: z.string().min(1).max(120).optional(),
});
type CreatePoolDto = z.infer<typeof createPoolSchema>;

const updateStatusSchema = z.object({
  status: z.string().min(1).max(120),
});
type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

const addCourseSchema = z.object({
  courseId: z.string().uuid(),
});
type AddCourseDto = z.infer<typeof addCourseSchema>;

@ApiTags('elective-pools')
@Controller('elective-pools')
export class ElectivePoolController {
  constructor(private readonly service: ElectivePoolService) {}

  @Get()
  @ApiOperation({ summary: 'Seçmeli havuz listesi (ders sayısıyla, personel)' })
  listPools() {
    return this.service.listPools();
  }

  @Post()
  @ApiOperation({ summary: 'Seçmeli havuz oluştur (personel)' })
  createPool(@Body(new ZodValidationPipe(createPoolSchema)) body: CreatePoolDto) {
    return this.service.createPool(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Seçmeli havuz durumunu güncelle (personel)' })
  updatePoolStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: UpdateStatusDto,
  ) {
    return this.service.updatePoolStatus(id, body);
  }

  @Get(':id/courses')
  @ApiOperation({ summary: 'Havuzdaki dersler (ders join, personel)' })
  listPoolCourses(@Param('id') id: string) {
    return this.service.listPoolCourses(id);
  }

  @Post(':id/courses')
  @ApiOperation({ summary: 'Havuza ders ekle (aynı ders 409, personel)' })
  addPoolCourse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addCourseSchema)) body: AddCourseDto,
  ) {
    return this.service.addPoolCourse(id, body.courseId);
  }
}
