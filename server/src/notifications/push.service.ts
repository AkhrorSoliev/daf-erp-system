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

  getVapidPublicKey(): string | null {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') || null;
  }
}
