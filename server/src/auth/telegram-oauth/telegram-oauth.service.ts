import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth.service';
import { getAllowedRoleIds } from '../portal-roles.config';
import { TelegramOauthConfig } from './telegram-oauth.config';
import { TelegramIdTokenVerifier } from './telegram-id-token.verifier';
import { TelegramOauthStateStore } from './telegram-oauth-state.store';

/** Hujjatdan verbatim. */
const TOKEN_URL = 'https://oauth.telegram.org/token';
/** Klient sessiyani olib ketishi uchun juda qisqa oyna. */
export const HANDOFF_TTL_SEC = 60;
/** Portalda SPA'ni qabul qiladigan sahifa. */
const PORTAL_CALLBACK_PATH = '/auth/telegram/callback';

const handoffKey = (handoff: string) => `tg_oauth:handoff:${handoff}`;

@Injectable()
export class TelegramOauthService {
  private readonly logger = new Logger(TelegramOauthService.name);

  constructor(
    private readonly config: TelegramOauthConfig,
    private readonly stateStore: TelegramOauthStateStore,
    private readonly verifier: TelegramIdTokenVerifier,
    private readonly authService: AuthService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Telegram redirect qilgan callback.
   *
   * NEGA TOKENLAR URL'DA EMAS: URL brauzer tarixiga, referrer'ga va
   * ko'pincha server loglariga tushadi. Shuning uchun portalga faqat bir
   * martalik `handoff` kodi beriladi, tokenlarni SPA alohida so'rov bilan oladi.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    const stored = await this.stateStore.consumeState(state);
    if (!stored) {
      // Muddati o'tgan, takror ishlatilgan yoki umuman bizdan chiqmagan.
      throw new BadRequestException(
        "Kirish so'rovi eskirgan. Iltimos, qaytadan urinib ko'ring.",
      );
    }
    if (!code) {
      throw new BadRequestException("Telegram kod qaytarmadi");
    }

    const idToken = await this.exchangeCode(code, stored.codeVerifier);
    const identity = await this.verifier.verify(idToken);

    // Portal rollari — parol bilan kirishdagi AYNAN shu mantiq.
    const allowedRoleIds = getAllowedRoleIds(stored.portalOrigin);
    const user = await this.authService.findAccountByIdentifier(
      identity.phoneNumber,
      allowedRoleIds,
    );
    if (!user) {
      throw new UnauthorizedException(
        "Bu Telegram raqami tizimda yo'q. Administrator bilan bog'laning.",
      );
    }

    // Rol darvozasi + tokenlar — mavjud login yo'li.
    const session = await this.authService.login(user, stored.portalOrigin);

    const handoff = randomBytes(32).toString('hex');
    await this.redis.set(
      handoffKey(handoff),
      JSON.stringify(session),
      'EX',
      HANDOFF_TTL_SEC,
    );

    const redirectUrl = new URL(PORTAL_CALLBACK_PATH, stored.portalOrigin);
    redirectUrl.searchParams.set('handoff', handoff);
    return { redirectUrl: redirectUrl.toString() };
  }

  /** Bir martalik: `getdel` atomik o'qib-o'chiradi. */
  async completeHandoff(handoff: string) {
    const raw = handoff ? await this.redis.getdel(handoffKey(handoff)) : null;
    if (!raw) {
      throw new BadRequestException(
        "Sessiya muddati tugadi. Iltimos, qaytadan kiring.",
      );
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new BadRequestException(
        "Sessiya muddati tugadi. Iltimos, qaytadan kiring.",
      );
    }
  }

  /** Authorization code → `id_token` (client secret bilan, server tomonda). */
  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    });
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        },
        body: body.toString(),
      });
    } catch (error) {
      this.logger.error(
        `Telegram token endpointiga ulanib bo'lmadi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException(
        "Telegram bilan bog'lanib bo'lmadi. Qaytadan urinib ko'ring.",
      );
    }

    if (!res.ok) {
      // Javob matnini logga yozamiz (secret unda bo'lmaydi), foydalanuvchiga umumiy xato.
      this.logger.warn(
        `Telegram token almashtirish rad etildi (${res.status}): ${await res
          .text()
          .catch(() => '—')}`,
      );
      throw new UnauthorizedException(
        "Telegram kirishni tasdiqlamadi. Qaytadan urinib ko'ring.",
      );
    }

    const payload = (await res.json().catch(() => null)) as
      | { id_token?: string }
      | null;
    const idToken = payload?.id_token;
    if (!idToken) {
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }
    return idToken;
  }
}
