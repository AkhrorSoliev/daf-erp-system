import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private initialized = false;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const email =
      this.configService.get<string>('VAPID_EMAIL') ||
      'mailto:admin@dafzentrum.uz';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.initialized = true;
      this.logger.log('Web Push VAPID keys configured');
    } else {
      this.logger.warn(
        'VAPID keys not configured — push notifications disabled',
      );
    }
  }

  async sendToUser(
    userId: number,
    payload: { title: string; body: string; url?: string },
  ) {
    await Promise.allSettled([
      this.sendWebPush(userId, payload),
      this.sendNativePush(userId, payload),
    ]);
  }

  private async sendWebPush(
    userId: number,
    payload: { title: string; body: string; url?: string },
  ) {
    if (!this.initialized) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription expired — remove it
          await this.prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
          this.logger.debug(`Removed expired push subscription: ${sub.id}`);
        } else {
          this.logger.error(
            `Push send failed for sub ${sub.id}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Native push via the Expo Push API (https://exp.host/--/api/v2/push/send).
   * Fully guarded — a missing table / network error never breaks the fan-out.
   * FCM (Android) / APNs (iOS) credentials live in the Expo project, not here.
   */
  private async sendNativePush(
    userId: number,
    payload: { title: string; body: string; url?: string },
  ) {
    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId },
      });
      if (devices.length === 0) return;

      const messages = devices.map((d) => ({
        to: d.token,
        title: payload.title,
        body: payload.body,
        sound: 'default',
        ...(payload.url ? { data: { url: payload.url } } : {}),
      }));

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const json: any = await res.json().catch(() => null);
      const tickets = json?.data;
      if (Array.isArray(tickets)) {
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (
            ticket?.status === 'error' &&
            ticket?.details?.error === 'DeviceNotRegistered'
          ) {
            await this.prisma.deviceToken
              .delete({ where: { token: devices[i].token } })
              .catch(() => {});
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Native push failed: ${error?.message}`);
    }
  }

  getVapidPublicKey(): string | null {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') || null;
  }
}
