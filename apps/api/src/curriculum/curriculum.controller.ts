import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { CurriculumService } from './curriculum.service.js';

const outcomeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(32).optional(),
  textTr: z.string().min(1).max(2000).optional(),
  textEn: z.string().max(2000).nullable().optional(),
  tyycDimension: z.string().max(64).nullable().optional(),
  sortNo: z.number().int().min(0).max(999).optional(),
  delete: z.boolean().optional(),
});
type OutcomeDto = z.infer<typeof outcomeSchema>;

const matrixCellSchema = z.object({
  courseCode: z.string().min(1).max(32),
  outcomeId: z.string().uuid(),
  level: z.number().int().min(0).max(3),
});
type MatrixCellDto = z.infer<typeof matrixCellSchema>;

const termWindowSchema = z.object({
  type: z.enum(['kayit', 'ekle_sil', 'mazeret', 'vize', 'final', 'butunleme']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
type TermWindowDto = z.infer<typeof termWindowSchema>;

const createCourseSchema = z.object({
  code: z.string().min(1).max(32),
  nameTr: z.string().min(1).max(200),
  nameEn: z.string().max(200).nullable().optional(),
  ects: z.number().int().min(0).max(120),
  localCredit: z.number().int().min(0).max(120),
  theoryHours: z.number().int().min(0).max(60).optional(),
  practiceHours: z.number().int().min(0).max(60).optional(),
  labHours: z.number().int().min(0).max(60).optional(),
});
type CreateCourseDto = z.infer<typeof createCourseSchema>;

const addCourseSchema = z.object({
  courseId: z.string().uuid(),
  semesterNo: z.number().int().min(1).max(20),
  isMandatory: z.boolean(),
});
type AddCourseDto = z.infer<typeof addCourseSchema>;

const prerequisiteSchema = z.object({
  prerequisite: z.record(z.string(), z.unknown()).nullable(),
});
type PrerequisiteDto = z.infer<typeof prerequisiteSchema>;

@ApiTags('curriculum')
@Controller()
export class CurriculumController {
  constructor(private readonly service: CurriculumService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Kiracı ders kataloğu (picker için: id, kod, ad, AKTS, yerel kredi)' })
  courseCatalog() {
    return this.service.listCourseCatalog();
  }

  @Post('courses')
  @ApiOperation({ summary: 'Kiracıya yeni ders ekle (aynı kod varsa 409)' })
  createCourse(@Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourseDto) {
    return this.service.createCourse(body);
  }

  @Get('programs')
  @ApiOperation({ summary: 'Programları listele' })
  programs() {
    return this.service.listPrograms();
  }

  @Get('programs/:id/curriculum-versions')
  @ApiOperation({ summary: 'Programın müfredat versiyonlarını listele (aktif + AKTS/ders özeti)' })
  programVersions(@Param('id') id: string) {
    return this.service.listProgramVersions(id);
  }

  @Get('programs/:id/outcomes')
  @ApiOperation({ summary: 'Programın program çıktılarını (PÇ) listele' })
  outcomes(@Param('id') id: string) {
    return this.service.listOutcomes(id);
  }

  @Post('programs/:id/outcomes')
  @ApiOperation({ summary: 'Program çıktısı ekle/güncelle/sil (yönetici veya koordinatör)' })
  upsertOutcome(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(outcomeSchema)) body: OutcomeDto,
  ) {
    return this.service.upsertOutcome(id, body);
  }

  @Get('curriculum-versions/:id/courses')
  @ApiOperation({ summary: 'Müfredat versiyonunun derslerini listele' })
  courses(@Param('id') id: string) {
    return this.service.getCurriculumCourses(id);
  }

  @Post('curriculum-versions/:id/courses')
  @ApiOperation({ summary: 'Müfredat versiyonuna ders ekle (idempotent, aynı ders varsa 409)' })
  addCourse(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addCourseSchema)) body: AddCourseDto,
  ) {
    return this.service.addCurriculumCourse(id, body);
  }

  @Patch('curriculum-courses/:id/prerequisite')
  @ApiOperation({ summary: 'Müfredat dersinin ön koşul ağacını güncelle (object|null)' })
  setPrerequisite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(prerequisiteSchema)) body: PrerequisiteDto,
  ) {
    return this.service.setPrerequisite(id, body.prerequisite);
  }

  @Get('curriculum-versions/:id/matrix')
  @ApiOperation({ summary: 'PÇ-DÇ ilişki matrisi (satır=ders, sütun=PÇ, hücre=düzey 0-3)' })
  matrix(@Param('id') id: string) {
    return this.service.getMatrix(id);
  }

  @Post('curriculum-versions/:id/matrix/cells')
  @ApiOperation({ summary: 'Matris hücresi ilişki düzeyini ayarla (0-3)' })
  setMatrixCell(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(matrixCellSchema)) body: MatrixCellDto,
  ) {
    return this.service.setMatrixCell(id, body);
  }

  @Get('curriculum-versions/:id/courses/:courseId/outcomes')
  @ApiOperation({ summary: 'Bir dersin öğrenme çıktılarını (DÇ) listele' })
  courseOutcomes(@Param('id') id: string, @Param('courseId') courseId: string) {
    return this.service.listCourseOutcomes(id, courseId);
  }

  @Get('reports/accreditation')
  @ApiOperation({ summary: 'Akreditasyon dökümü (program+versiyon: künye/TYYÇ/AKTS/PÇ/DÇ/matris/kapsama)' })
  accreditation(
    @Query('programId') programId: string,
    @Query('versionId') versionId: string,
  ) {
    if (!programId || !versionId) {
      throw new BadRequestException('programId ve versionId zorunludur');
    }
    return this.service.accreditationReport(programId, versionId);
  }

  @Get('calendar/terms')
  @ApiOperation({ summary: 'Kiracıdaki tüm akademik dönemleri listele' })
  terms() {
    return this.service.listTerms();
  }

  @Post('calendar/terms/:id/windows')
  @ApiOperation({ summary: 'Döneme işlem penceresi ekle/güncelle (yönetici, audit)' })
  upsertTermWindow(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(termWindowSchema)) body: TermWindowDto,
  ) {
    return this.service.upsertTermWindow(id, body);
  }

  @Post('calendar/terms/:id/activate')
  @ApiOperation({ summary: 'Dönemi aktif yap (diğerlerini pasifle, audit)' })
  activateTerm(@Param('id') id: string) {
    return this.service.activateTerm(id);
  }
}
