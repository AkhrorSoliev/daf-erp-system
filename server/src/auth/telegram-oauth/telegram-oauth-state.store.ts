import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { isKnownPortalOrigin } from '../portal-roles.config';
import { TelegramOauthConfig } from './telegram-oauth.config';

/** Telegram authorize endpointi (hujjatdan verbatim). */
const AUTHORIZE_URL = 'https://oauth.telegram.org/auth';
/** Hujjatdagi scope'lar: `openid` (majburiy) + `profile` + `phone`. */
const SCOPE = 'openid profile phone';
export const STATE_TTL_SEC = 300;

const stateKey = (state: string) => `tg_oauth:state:${state}`;

interface StoredState {
  portalOrigin: string;
  codeVerifier: string;
}

/**
 * `state` + PKCE do'koni.
 *
 * NEGA `code_verifier` SERVERDA: `state` va PKCE **kod almashtirishni**
 * qo'riqlaydi — begona `code` ni bizning oqimimizga tiqib qo'yish yoki bir
 * kodni ikki marta ishlatish mumkin emas. Verifier brauzerda bo'lsa, uni
 * boshqa qurilmaga ko'chirish mumkin bo'lardi, shuning uchun u faqat Redis'da.
 *
 * DIQQAT — bu «brauzerga bog'lash» EMAS: brauzerda hech narsa saqlanmaydi
 * (cookie ham, verifier ham yo'q). Eski bot-havola oqimidagi relay teshigini
 * yopadigan xossa boshqa: Telegram `code` ni **tasdiqlagan brauzer** orqali
 * bizga yetkazadi va `handoff` shu brauzerning 302'sida qaytadi. Batafsil
 * izoh va qolgan xavf (60 sekundlik `?handoff=` havolasi) `server/CLAUDE.md`
 * dagi Telegram OAuth bo'limida.
 *
 * NEGA `portalOrigin` SAQLANADI: callback'ga Telegram keladi — u yerdagi
 * `Origin` foydalanuvchi portalini bildirmaydi. Qaytish manzili shu yerdan
 * olinadi va oq ro'yxatdan o'tkaziladi (ochiq redirect bo'lmasligi uchun).
 */
@Injectable()
export class TelegramOauthStateStore {
  constructor(
    private readonly redis: RedisService,
    private readonly config: TelegramOauthConfig,
  ) {}

  async createAuthorizeUrl(portalOrigin: string): Promise<string> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        "Telegram orqali kirish hozircha yoqilmagan",
      );
    }
    if (!isKnownPortalOrigin(portalOrigin)) {
      throw new BadRequestException("Noma'lum portal manzili");
    }

    const state = randomBytes(32).toString('hex');
    // 32 bayt → 43 belgili base64url (RFC 7636 talab qilgan 43–128 oralig'ida).
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    await this.redis.set(
      stateKey(state),
      JSON.stringify({ portalOrigin, codeVerifier } as StoredState),
      'EX',
      STATE_TTL_SEC,
    );

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /** Bir martalik: `getdel` atomik o'qib-o'chiradi (takror ishlatib bo'lmaydi). */
  async consumeState(state: string): Promise<StoredState | null> {
    const raw = state ? await this.redis.getdel(stateKey(state)) : null;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredState;
      if (!isKnownPortalOrigin(parsed.portalOrigin)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
