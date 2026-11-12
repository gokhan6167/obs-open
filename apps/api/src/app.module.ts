import type { IncomingMessage } from 'node:http';
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { envSchema } from './config/env.js';
import { CurriculumModule } from './curriculum/curriculum.module.js';
import { DrizzleModule } from './db/drizzle.module.js';
import { DisciplineModule } from './discipline/discipline.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { DoubleMajorModule } from './double-major/double-major.module.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { GradesModule } from './grades/grades.module.js';
import { GraduationModule } from './graduation/graduation.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthDomainModule } from './health/health-module.module.js';
import { MigrationModule } from './migration/migration.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RequestModule } from './requests/request.module.js';
import { ParametersModule } from './parameters/parameters.module.js';
import { PortalModule } from './portal/portal.module.js';
import { StudentsModule } from './students/students.module.js';
import { FacilitiesModule } from './facilities/facilities.module.js';
import { StudentFileModule } from './student-file/student-file.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { DiplomaModule } from './diploma/diploma.module.js';
import { ExamModule } from './exam/exam.module.js';
import { AdaptationModule } from './adaptation/adaptation.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { SurveyModule } from './survey/survey.module.js';
import { GovernanceModule } from './governance/governance.module.js';
import { SectionDetailModule } from './section-detail/section-detail.module.js';
import { ElectivePoolModule } from './elective-pool/elective-pool.module.js';
import { AcademicWeeksModule } from './academic-weeks/academic-weeks.module.js';
import { PhotoModule } from './photo/photo.module.js';
import { SupportModule } from './support/support.module.js';
import { StudentRequestModule } from './student-request/student-request.module.js';
import { ThesisModule } from './thesis/thesis.module.js';
import { ClubModule } from './club/club.module.js';
import { AlumniExchangeModule } from './alumni-exchange/alumni-exchange.module.js';
import { ApprovalModule } from './approval/approval.module.js';
import { AdmissionsDeepModule } from './admissions-deep/admissions-deep.module.js';
import { LanguageModule } from './language/language.module.js';
import { InternationalModule } from './international/international.module.js';
import { ThesisProcessModule } from './thesis-process/thesis-process.module.js';
import { InternshipModule } from './internship/internship.module.js';
import { CoopModule } from './coop/coop.module.js';
import { PartTimeModule } from './part-time/part-time.module.js';
import { WellbeingModule } from './wellbeing/wellbeing.module.js';
import { CampusModule } from './campus/campus.module.js';
import { BillingModule } from './billing/billing.module.js';
import { QualityModule } from './quality/quality.module.js';
import { InvestigationModule } from './investigation/investigation.module.js';
import { SignatureModule } from './signature/signature.module.js';
import { IntegrationModule } from './integration/integration.module.js';
import { AcademicStructureModule } from './academic-structure/academic-structure.module.js';
import { TenantMiddleware } from './tenant/tenant.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env, bootstrap'ta loadEnvFile ile process.env'e yüklendi; burada sadece
      // process.env doğrulanır. Env geçersizse uygulama ayağa kalkmaz.
      ignoreEnvFile: true,
      validate: (config: Record<string, unknown>) => envSchema.parse(config),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_TTL') ?? '12h' },
      }),
    }),
    // Structured logging (pino). Dev'de okunur (pretty), üretimde JSON. Auth
    // başlıkları redakte; sağlık uçları log gürültüsü yapmaz.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pretty = config.get<string>('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            level: config.getOrThrow<string>('LOG_LEVEL'),
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-user-roles"]'],
            autoLogging: {
              ignore: (req: IncomingMessage) => (req.url ?? '').includes('/health'),
            },
            // Dev'de okunur çıktı; üretimde saf JSON (transport anahtarı hiç konmaz).
            ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
          },
        };
      },
    }),
    // Hız sınırı — kaba kuvvet/gürültü koruması (global guard aşağıda).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL') * 1000, // saniye -> ms
            limit: config.getOrThrow<number>('RATE_LIMIT_LIMIT'),
          },
        ],
      }),
    }),
    DrizzleModule,
    AuthModule,
    AuditModule,
    ParametersModule,
    CurriculumModule,
    StudentsModule,
    CalendarModule,
    EnrollmentModule,
    GradesModule,
    DocumentsModule,
    GraduationModule,
    FinanceModule,
    NotificationsModule,
    RequestModule,
    ReportsModule,
    HealthDomainModule,
    MigrationModule,
    DoubleMajorModule,
    PortalModule,
    DisciplineModule,
    FacilitiesModule,
    StudentFileModule,
    AdmissionsModule,
    DiplomaModule,
    ExamModule,
    AdaptationModule,
    MessagingModule,
    SurveyModule,
    GovernanceModule,
    SectionDetailModule,
    ElectivePoolModule,
    AcademicWeeksModule,
    PhotoModule,
    SupportModule,
    StudentRequestModule,
    ThesisModule,
    ClubModule,
    AlumniExchangeModule,
    ApprovalModule,
    AdmissionsDeepModule,
    LanguageModule,
    InternationalModule,
    ThesisProcessModule,
    InternshipModule,
    CoopModule,
    PartTimeModule,
    WellbeingModule,
    CampusModule,
    BillingModule,
    QualityModule,
    InvestigationModule,
    SignatureModule,
    IntegrationModule,
    AcademicStructureModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global hız sınırı guard'ı.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global istisna filtresi: tutarlı hata zarfı + 5xx log/Sentry.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
