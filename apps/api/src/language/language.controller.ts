import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { LanguageService } from './language.service.js';

const createProficiencySchema = z
  .object({
    studentId: z.string().uuid().optional(),
    applicantId: z.string().uuid().optional(),
    examType: z.enum(['toefl', 'pte', 'yds', 'yokdil', 'kurum_ici']),
    score: z.number().min(0).max(100).optional(),
    examDate: z.string().date().optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => Boolean(v.studentId) || Boolean(v.applicantId), {
    message: 'studentId veya applicantId zorunlu',
  });
type CreateProficiencyDto = z.infer<typeof createProficiencySchema>;

const updateProficiencySchema = z.object({
  result: z.enum(['muaf', 'hazirlik', 'beklemede']),
  note: z.string().max(1000).optional(),
});
type UpdateProficiencyDto = z.infer<typeof updateProficiencySchema>;

@ApiTags('language')
@Controller('language')
export class LanguageController {
  constructor(private readonly service: LanguageService) {}

  @Get('proficiencies')
  @ApiOperation({ summary: 'Dil yeterlilik kayıtları (öğrenci/aday adı join, ?studentId/?applicantId)' })
  listProficiencies(
    @Query('studentId') studentId?: string,
    @Query('applicantId') applicantId?: string,
  ) {
    return this.service.listProficiencies(studentId, applicantId);
  }

  @Post('proficiencies')
  @ApiOperation({ summary: 'Dil yeterlilik kaydı oluştur → sonuç puandan otomatik (personel + audit)' })
  createProficiency(
    @Body(new ZodValidationPipe(createProficiencySchema)) body: CreateProficiencyDto,
  ) {
    return this.service.createProficiency(body);
  }

  @Get('prep-list')
  @ApiOperation({ summary: 'Hazırlık programına düşenler (result = hazirlik)' })
  prepList() {
    return this.service.prepList();
  }

  @Patch('proficiencies/:id')
  @ApiOperation({ summary: 'Dil yeterlilik sonucunu güncelle (personel + audit)' })
  updateProficiency(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProficiencySchema)) body: UpdateProficiencyDto,
  ) {
    return this.service.updateProficiency(id, body);
  }
}
