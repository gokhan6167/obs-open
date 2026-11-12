import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { SignatureService } from './signature.service.js';

const createSchema = z.object({
  subjectType: z.string().min(1).max(120),
  subjectId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  signers: z
    .array(
      z
        .object({
          signerUserId: z.string().uuid().optional(),
          // Sistemde kullanıcısı olmayan imzacı (dış kurum) için serbest ad.
          signerName: z.string().min(1).max(200).optional(),
        })
        .refine((s) => Boolean(s.signerUserId ?? s.signerName), {
          message: 'signerUserId veya signerName zorunlu',
        }),
    )
    .min(1)
    .max(20),
});
type CreateDto = z.infer<typeof createSchema>;

const signSchema = z.object({
  note: z.string().max(2000).optional(),
});
type SignDto = z.infer<typeof signSchema>;

const rejectSchema = z.object({
  note: z.string().min(1).max(2000),
});
type RejectDto = z.infer<typeof rejectSchema>;

@ApiTags('signatures')
@Controller('signatures')
export class SignatureController {
  constructor(private readonly service: SignatureService) {}

  @Get()
  @ApiOperation({ summary: 'İmza kayıtları (personel; ?status,?subjectType)' })
  list(@Query('status') status?: string, @Query('subjectType') subjectType?: string) {
    return this.service.list(status, subjectType);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Aktörün imzasını bekleyen belgeler (sıra aktörde olanlar)' })
  pending() {
    return this.service.pending();
  }

  @Post()
  @ApiOperation({ summary: 'İmza zinciri oluştur (personel; imzacılar seq 1..N)' })
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateDto) {
    return this.service.create(body);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'İmzala (yalnız imzacı; sıra kendisinde değilse 409)' })
  sign(@Param('id') id: string, @Body(new ZodValidationPipe(signSchema)) body: SignDto) {
    return this.service.sign(id, body);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'İmzayı reddet (yalnız imzacı; gerekçe zorunlu)' })
  reject(@Param('id') id: string, @Body(new ZodValidationPipe(rejectSchema)) body: RejectDto) {
    return this.service.reject(id, body);
  }

  @Get('subject/:subjectType/:subjectId')
  @ApiOperation({ summary: 'Belgenin sıralı imza zinciri (durumlarıyla)' })
  chain(@Param('subjectType') subjectType: string, @Param('subjectId') subjectId: string) {
    return this.service.chain(subjectType, subjectId);
  }
}
