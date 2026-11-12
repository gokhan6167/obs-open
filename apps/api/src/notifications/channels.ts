import { Injectable } from '@nestjs/common';

/**
 * Bildirim kanalı adaptörü (M8). Gerçek sağlayıcılar (Netgsm SMS, SMTP, mobil
 * push) sonradan adaptörle takılır (§4 deseni: arayüz + mock + sonradan tak).
 */
export interface OutboundMessage {
  userId: string;
  title: string;
  body: string;
}

export interface NotificationChannel {
  /** Kanal adı; kullanıcı tercihiyle (notification_prefs.channel) eşleşir. */
  readonly name: string;
  send(message: OutboundMessage): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/** Dev mock'ları — noop (gerçek gönderim yok). Üretimde adaptör değişir. */
@Injectable()
export class MockEmailChannel implements NotificationChannel {
  readonly name = 'email';
  send(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class MockSmsChannel implements NotificationChannel {
  readonly name = 'sms';
  send(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class MockPushChannel implements NotificationChannel {
  readonly name = 'push';
  send(): Promise<void> {
    return Promise.resolve();
  }
}
