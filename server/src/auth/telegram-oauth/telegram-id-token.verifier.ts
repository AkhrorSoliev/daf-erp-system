import {
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
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

/**
 * `TelegramIdTokenVerifier` konstruktorining ikkinchi argumenti uchun DI
 * tokeni. `JWTVerifyGetKey` — chaqiriladigan (function) interfeys, shuning
 * uchun `emitDecoratorMetadata` uni oddiy `Function` sifatida yozadi va Nest
 * TypeScript'ning `?` (ixtiyoriy parametr) belgisini KO'RMAYDI — natijada
 * Nest `Function` tokenini resolve qilishga urinib, ilova umuman
 * ko'tarilmay qoladi. Aniq token buni oldini oladi.
 *
 * `AuthModule`da bu token uchun provider RO'YXATDAN O'TKAZILMAYDI — prodda
 * `@Optional()` uni `undefined` qilib qoldiradi va konstruktor
 * `createRemoteJWKSet`ga tushadi. Faqat testlar buni to'g'ridan-to'g'ri
 * pozitsion argument sifatida uzatadi (`new TelegramIdTokenVerifier(cfg,
 * keyResolver)`), Nest konteyneridan o'tmasdan.
 */
export const TELEGRAM_JWKS_RESOLVER = 'TELEGRAM_JWKS_RESOLVER';

export interface VerifiedTelegramIdentity {
  /** `phone_number` claim — `+` belgisiz, mamlakat kodi bilan. */
  phoneNumber: string;
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
    @Optional()
    @Inject(TELEGRAM_JWKS_RESOLVER)
    keyResolver?: JWTVerifyGetKey,
  ) {
    this.keyResolver = keyResolver ?? createRemoteJWKSet(new URL(JWKS_URL));
  }

  async verify(idToken: string): Promise<VerifiedTelegramIdentity> {
    if (!idToken) {
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }

    // Bo'sh clientId bilan jose `aud` solishtiruvini o'tkazib yuboradi
    // (faqat mavjudligini tekshiradi) — bu aynan shu klass taqiqlagan
    // yumshatish. Sozlanmagan holatda oldindan yopiq holatga o'tamiz.
    if (!this.config.clientId) {
      throw new UnauthorizedException('Telegram orqali kirish sozlanmagan');
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(idToken, this.keyResolver, {
        issuer: ISSUER,
        audience: this.config.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
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
      typeof payload.phone_number === 'string'
        ? payload.phone_number.trim()
        : '';
    if (!phoneNumber || payload.phone_number_verified !== true) {
      throw new UnauthorizedException(
        "Telegram telefon raqamini bermadi. Ruxsat berib qayta urinib ko'ring.",
      );
    }

    // `id` CLAIM'I TEKSHIRILMAYDI — Telegram uni yubormaydi.
    //
    // Hujjatdagi misol payload'da `id: 987654321` bor edi va biz o'shanga
    // qarab uni majburiy qilgan edik. Lekin Telegram'ning o'z discovery
    // hujjati (`/.well-known/openid-configuration` → `claims_supported`)
    // faqat shularni sanaydi: aud, preferred_username, phone_number, exp,
    // iat, iss, name, picture, sub. Natijada prod'da HAR BIR kirish jimgina
    // «Telegram javobi tekshirilmadi» bilan rad etildi (2026-08-01).
    //
    // Qiymati bizga kerak ham emas: bu funksiya faqat `phoneNumber`
    // qaytaradi, akkaunt esa telefon bo'yicha topiladi. Yo'q claim'ni talab
    // qilish tekshiruvni kuchaytirmaydi — u shunchaki oqimni o'ldiradi.
    return { phoneNumber };
  }
}
