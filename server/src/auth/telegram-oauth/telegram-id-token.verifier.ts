import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';
import { TelegramOauthConfig } from './telegram-oauth.config';

/** Hujjatdan verbatim. */
const ISSUER = 'https://oauth.telegram.org';
const JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';

export interface VerifiedTelegramIdentity {
  /** `phone_number` claim — `+` belgisiz, mamlakat kodi bilan. */
  phoneNumber: string;
  /** `id` claim — Telegram user id. `sub` EMAS (u opaque identifikator). */
  telegramUserId: string;
}

/**
 * `id_token` tekshiruvi.
 *
 * BU YERDA HECH NARSA YUMSHATILMAYDI: imzo, `iss`, `aud`, `exp` va tasdiqlangan
 * telefon — beshtasidan bittasi o'tmasa kirish rad etiladi. Tekshiruvni
 * chetlab o'tish (masalan tokenni imzosiz o'qish) butun oqimni ma'nosiz
 * qiladi, chunki ishonch faqat shu imzoga tayanadi.
 */
@Injectable()
export class TelegramIdTokenVerifier {
  private readonly logger = new Logger(TelegramIdTokenVerifier.name);
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(
    private readonly config: TelegramOauthConfig,
    /** Testlar lokal JWKS uzatadi; prodda masofadagi kalitlar keshlanadi. */
    keyResolver?: JWTVerifyGetKey,
  ) {
    this.keyResolver = keyResolver ?? createRemoteJWKSet(new URL(JWKS_URL));
  }

  async verify(idToken: string): Promise<VerifiedTelegramIdentity> {
    if (!idToken) {
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(idToken, this.keyResolver, {
        issuer: ISSUER,
        audience: this.config.clientId,
      });
      payload = verified.payload;
    } catch (error) {
      // Sababni faqat logga yozamiz — foydalanuvchiga bir xil xato.
      this.logger.warn(
        `id_token tekshiruvi muvaffaqiyatsiz: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }

    const phoneNumber =
      typeof payload.phone_number === 'string' ? payload.phone_number.trim() : '';
    if (!phoneNumber || payload.phone_number_verified !== true) {
      throw new UnauthorizedException(
        "Telegram telefon raqamini bermadi. Ruxsat berib qayta urinib ko'ring.",
      );
    }

    const rawId = payload.id;
    const telegramUserId =
      typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';

    return { phoneNumber, telegramUserId };
  }
}
