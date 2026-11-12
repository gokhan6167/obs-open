import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { httpUrl } from '../common/url.schema.js';
import { PortalService } from './portal.service.js';

const updateContactSchema = z.object({
  phone: z.string().max(30).nullable().optional(),
  // z.url() `javascript:` şemasını geçirir; http(s) allowlist'i şart.
  photoUrl: httpUrl(2048).nullable().optional(),
});
type UpdateContactDto = z.infer<typeof updateContactSchema>;

/** Çok-rollü demo arayüzü için okuma uçları (JWT bağlamına göre kapsanır). */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Giriş yapan kullanıcı + (öğrenciyse) profil/GNO/notlar' })
  me() {
    return this.service.me();
  }

  @Patch('me/contact')
  @ApiOperation({ summary: 'Giriş yapan kullanıcının iletişim bilgilerini güncelle (telefon/foto)' })
  updateContact(@Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactDto) {
    return this.service.updateMyContact(body);
  }

  @Get('double-major')
  @ApiOperation({ summary: 'ÇAP/yandal başvuruları (personel: kuyruk, öğrenci: kendi)' })
  doubleMajor() {
    return this.service.doubleMajorList();
  }

  @Get('teaching')
  @ApiOperation({ summary: 'Hoca: verdiği şubeler + öğrenci listesi' })
  teaching() {
    return this.service.teaching();
  }

  @Get('announcements')
  @ApiOperation({ summary: 'Üniversite geneli duyurular' })
  announcements() {
    return this.service.announcements();
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Öğrencinin ders programı (kayıtlı dersler)' })
  schedule() {
    return this.service.schedule();
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Öğrencinin ders×tür bazında devamsızlık oranı + kalan hakkı (kendi)' })
  attendance() {
    return this.service.attendanceSummary();
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Öğrenciye düşen bildirimler (sahiplik: yalnızca aktör hedefli)' })
  notifications() {
    return this.service.notificationsList();
  }

  @Get('course-content/:sectionId')
  @ApiOperation({
    summary: 'Dersin Bologna içeriği: öğrenme çıktıları + değerlendirme + AKTS iş yükü',
  })
  courseContent(@Param('sectionId') sectionId: string) {
    return this.service.courseContent(sectionId);
  }

  @Get('grade-components/:sectionId')
  @ApiOperation({ summary: 'Öğrencinin bir dersteki not bileşen kırılımı (sahiplik: kendi skorları)' })
  gradeComponents(@Param('sectionId') sectionId: string) {
    return this.service.myGradeComponents(sectionId);
  }

  @Get('available-sections')
  @ApiOperation({ summary: 'Aktif dönemde seçilebilir şubeler (ders seçme)' })
  availableSections() {
    return this.service.availableSections();
  }

  @Get('requests')
  @ApiOperation({ summary: 'Talepler (personel: tümü, öğrenci: kendi)' })
  requestsList() {
    return this.service.requestsList();
  }

  @Get('students')
  @ApiOperation({ summary: 'Öğrenci listesi/arama (personel): no+ad+program+durum+GNO' })
  studentsList() {
    return this.service.studentsList();
  }

  @Get('pending-enrollments')
  @ApiOperation({ summary: 'Bekleyen ders kayıt onay kuyruğu (submitted)' })
  pendingEnrollments() {
    return this.service.pendingEnrollments();
  }

  @Get('sections')
  @ApiOperation({ summary: 'Aktif dönem şubeleri + doluluk + hoca (personel)' })
  sectionsList() {
    return this.service.sectionsList();
  }

  @Get('users')
  @ApiOperation({ summary: 'Kullanıcı listesi + rolleri (personel)' })
  usersList() {
    return this.service.usersList();
  }

  @Get('parameters')
  @ApiOperation({ summary: 'Sistem parametreleri: harf ölçeği/GNO politikası/kurallar' })
  parametersList() {
    return this.service.parametersList();
  }

  @Get('audit')
  @ApiOperation({ summary: 'Audit log özeti (son 50)' })
  auditList() {
    return this.service.auditList();
  }
}
