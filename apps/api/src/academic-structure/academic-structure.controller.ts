import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AcademicStructureService } from './academic-structure.service.js';

const createFacultySchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});
type CreateFacultyDto = z.infer<typeof createFacultySchema>;

const createDepartmentSchema = z.object({
  facultyId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
});
type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;

const createProgramSchema = z.object({
  departmentId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  level: z.enum(['onlisans', 'lisans', 'yuksek_lisans', 'doktora']),
  language: z.string().min(1).max(16).optional(),
  educationModel: z.enum(['semester', 'committee']).optional(),
});
type CreateProgramDto = z.infer<typeof createProgramSchema>;

const createCurriculumVersionSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
});
type CreateCurriculumVersionDto = z.infer<typeof createCurriculumVersionSchema>;

@ApiTags('academic-structure')
@Controller('academic-structure')
export class AcademicStructureController {
  constructor(private readonly service: AcademicStructureService) {}

  @Get('tree')
  @ApiOperation({ summary: 'Fakülte > bölüm > program ağacı (program başına öğrenci sayısı)' })
  tree() {
    return this.service.tree();
  }

  @Get('faculties')
  @ApiOperation({ summary: 'Fakülte listesi (personel)' })
  listFaculties() {
    return this.service.listFaculties();
  }

  @Post('faculties')
  @ApiOperation({ summary: 'Fakülte oluştur (aynı kod varsa 409)' })
  createFaculty(@Body(new ZodValidationPipe(createFacultySchema)) body: CreateFacultyDto) {
    return this.service.createFaculty(body);
  }

  @Get('departments')
  @ApiOperation({ summary: 'Bölüm listesi (opsiyonel ?facultyId; fakülte adı join)' })
  listDepartments(@Query('facultyId') facultyId?: string) {
    return this.service.listDepartments(facultyId);
  }

  @Post('departments')
  @ApiOperation({ summary: 'Bölüm oluştur (aynı kod varsa 409)' })
  createDepartment(@Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentDto) {
    return this.service.createDepartment(body);
  }

  @Get('programs')
  @ApiOperation({ summary: 'Program listesi (opsiyonel ?departmentId; bölüm + fakülte adı join)' })
  listPrograms(@Query('departmentId') departmentId?: string) {
    return this.service.listPrograms(departmentId);
  }

  @Post('programs')
  @ApiOperation({ summary: 'Program oluştur (aynı kod varsa 409)' })
  createProgram(@Body(new ZodValidationPipe(createProgramSchema)) body: CreateProgramDto) {
    return this.service.createProgram(body);
  }

  @Get('programs/:id/curriculum-versions')
  @ApiOperation({ summary: 'Programın müfredat versiyonlarını listele' })
  listCurriculumVersions(@Param('id') id: string) {
    return this.service.listCurriculumVersions(id);
  }

  @Post('programs/:id/curriculum-versions')
  @ApiOperation({ summary: 'Programa müfredat versiyonu ekle (aynı yıl varsa 409)' })
  createCurriculumVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createCurriculumVersionSchema)) body: CreateCurriculumVersionDto,
  ) {
    return this.service.createCurriculumVersion(id, body);
  }
}
