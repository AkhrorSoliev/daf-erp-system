import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Telegram OAuth (OIDC) sozlamasi.
 *
 * NEGA `enabled` BAYROG'I: Client ID/secret BotFather'da qo'lda olinadi va
 * Railway env'iga qo'lda qo'yiladi. Sozlama kelmasa kod xavfsiz turishi kerak —
 * funksiya o'chiq bo'ladi, klient tugmani ko'rsatmaydi. Jimgina yarim ishlaydigan
 * holat eng yomon variant.
 */
@Injectable()
export class TelegramOauthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;

  constructor(config: ConfigService) {
    this.clientId = (config.get<string>('TELEGRAM_OAUTH_CLIENT_ID') ?? '').trim();
    this.clientSecret = (
      config.get<string>('TELEGRAM_OAUTH_CLIENT_SECRET') ?? ''
    ).trim();
    this.redirectUri = (
      config.get<string>('TELEGRAM_OAUTH_REDIRECT_URI') ?? ''
    ).trim();
  }

  get enabled(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }
}
