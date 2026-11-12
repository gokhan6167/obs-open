import { Global, Module } from '@nestjs/common';
import {
  MockEmailChannel,
  MockPushChannel,
  MockSmsChannel,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from './channels.js';
import { NotificationService } from './notification.service.js';

/** Bildirim her modülden çağrılabilir -> global. Kanal adaptörleri mock. */
@Global()
@Module({
  providers: [
    MockEmailChannel,
    MockSmsChannel,
    MockPushChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [MockEmailChannel, MockSmsChannel, MockPushChannel],
      useFactory: (
        email: MockEmailChannel,
        sms: MockSmsChannel,
        push: MockPushChannel,
      ): NotificationChannel[] => [email, sms, push],
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
