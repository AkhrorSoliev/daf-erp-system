import {
  BadRequestException,
  HttpException,
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
import { describeValue } from '../../common/utils/describe-value';

/** Hujjatdan verbatim. */
const TOKEN_URL = 'https://oauth.telegram.org/token';
/** Klient sessiyani olib ketishi uchun juda qisqa oyna. */
export const HANDOFF_TTL_SEC = 60;
/** Portalda SPA'ni qabul qiladigan sahifa. */
const PORTAL_CALLBACK_PATH = '/auth/telegram/callback';

/**
 * `consumeState` dan KEYIN yuz bergan xatolarda foydalanuvchiga ko'rsatiladigan
 * umumiy xabar. Faqat kutilmagan (HttpException bo'lmagan) xatolar uchun —
 * ichki tafsilot query stringga chiqib ketmasin.
 */
const GENERIC_FAILURE = "Kirishni tugatib bo'lmadi. Qaytadan urinib ko'ring.";

const handoffKey = (handoff: string) => `tg_oauth:handoff:${handoff}`;

/**
 * Handoff Redis'da saqlaydigan va `completeHandoff` qaytaradigan sessiya
 * shakli. Qo'lda yozilgan interfeys emas, balki `AuthService.login`ning haqiqiy
 * qaytish qiymatidan olingan — parol bilan kirish yo'li AYNAN shu shaklni
 * qaytaradi, shuning uchun ikkalasi mustaqil yozilsa, biri o'zgarganda
 * ikkinchisi sezmasdan orqada qolib ketishi mumkin edi.
 */
export type TelegramOauthSession = Awaited<ReturnType<AuthService['login']>>;

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
    // `code` tekshiruvi `consumeState` dan OLDIN: `state` bir martalik, ya'ni
    // uni iste'mol qilib keyin "kod yo'q" deb rad etsak, foydalanuvchi hech
    // qanday aybi yo'q holatda butun oqimni qaytadan boshlashga majbur
    // bo'lardi. Kontrollerdagi `error` tarmog'i ham xuddi shu tartibda ishlaydi.
    if (!code) {
      throw new BadRequestException('Telegram kod qaytarmadi');
    }

    const stored = await this.stateStore.consumeState(state);
    if (!stored) {
      // Muddati o'tgan, takror ishlatilgan yoki umuman bizdan chiqmagan.
      // Bu YAGONA holat JSON xato bo'lib qoladi: portal manzili `state` ichida
      // saqlanadi, ya'ni bu yerda odamni qaytaradigan manzil BIZGA MA'LUM EMAS.
      throw new BadRequestException(
        "Kirish so'rovi eskirgan. Iltimos, qaytadan urinib ko'ring.",
      );
    }

    // Bu nuqtadan keyin portal manzili ma'lum, ya'ni har qanday xato
    // foydalanuvchini API domenida xom JSON bilan qoldirmasligi kerak — uni
    // portalning kirish sahifasiga tushunarli xabar bilan qaytaramiz.
    try {
      const handoff = await this.signIn(code, stored);
      return { redirectUrl: this.portalUrl(stored.portalOrigin, { handoff }) };
    } catch (error) {
      const message =
        error instanceof HttpException ? error.message : GENERIC_FAILURE;
      if (!(error instanceof HttpException)) {
        this.logger.error(
          `Telegram OAuth callback kutilmagan xato bilan tugadi: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return {
        redirectUrl: this.portalUrl(stored.portalOrigin, { error: message }),
      };
    }
  }

  /**
   * Kodni sessiyaga aylantiradi va bir martalik `handoff` kodini qaytaradi.
   * Har qanday rad etish — istisno (yuqoridagi `catch` uni portalga aylantiradi).
   */
  private async signIn(
    code: string,
    stored: { portalOrigin: string; codeVerifier: string },
  ): Promise<string> {
    const idToken = await this.exchangeCode(code, stored.codeVerifier);
    const identity = await this.verifier.verify(idToken);

    // Portal rollari — parol bilan kirishdagi AYNAN shu mantiq.
    const allowedRoleIds = getAllowedRoleIds(stored.portalOrigin);
    // `take: 2` — bizga faqat "bittami yoki ko'pmi" javobi kerak, va shu bitta
    // so'rov g'olib qatorni ham beradi (tartib `findAccountByIdentifier` bilan
    // bir xil), ya'ni ikkinchi bor bazaga bormaymiz.
    const matches = await this.authService.findAccountsByIdentifier(
      identity.phoneNumber,
      allowedRoleIds,
      2,
    );
    if (matches.length > 1) {
      // NA `User.login`, NA `User.phone` unique EMAS (server/CLAUDE.md), va
      // bazada haqiqiy dublikat bor. Parol yo'lida `updatedAt desc` g'olibini
      // tanlash zararsiz — o'sha akkauntning paroli baribir kerak. Bu yerda
      // parol yo'q, ya'ni g'olibni tanlash odamni BEGONA akkauntga (masalan
      // kassir raqami bilan Administrator sessiyasiga) kiritib qo'yardi.
      // Portal darvozasi ham yordam bermaydi — ikki akkaunt bir portalda
      // bo'lishi mumkin. Shuning uchun yopiq holatga o'tamiz.
      throw new UnauthorizedException(
        'Bu raqam bir nechta akkauntga tegishli. Iltimos, telefon raqam va parol bilan kiring.',
      );
    }
    const user = matches[0];
    if (!user) {
      throw new UnauthorizedException(
        "Bu Telegram raqami tizimda yo'q. Administrator bilan bog'laning.",
      );
    }
    // Parol bilan kirishdagi `validateUser` xuddi shu sababdan `null`
    // qaytaradi — Telegram yo'li parol yo'li QANDAY BO'LSA ham undan kengroq
    // bo'lmasligi kerak. `User.password` ixtiyoriy ustun, va parolsiz akkaunt
    // bugun umuman kira olmaydi; xuddi shu umumiy xabar (enumeration'ga
    // qarshi — qaysi sababdan rad etilgani ochilmaydi).
    if (!user.password) {
      throw new UnauthorizedException(
        "Bu Telegram raqami tizimda yo'q. Administrator bilan bog'laning.",
      );
    }

    // Rol darvozasi + tokenlar — mavjud login yo'li.
    const session: TelegramOauthSession = await this.authService.login(
      user,
      stored.portalOrigin,
    );

    const handoff = randomBytes(32).toString('hex');
    await this.redis.set(
      handoffKey(handoff),
      JSON.stringify(session),
      'EX',
      HANDOFF_TTL_SEC,
    );
    return handoff;
  }

  /**
   * Portalning callback sahifasiga manzil. `handoff` — muvaffaqiyat,
   * `error` — o'qiladigan xabar (URL'da faqat shu ikkisi; maxfiy hech narsa yo'q).
   */
  private portalUrl(
    portalOrigin: string,
    params: { handoff?: string; error?: string },
  ): string {
    const url = new URL(PORTAL_CALLBACK_PATH, portalOrigin);
    if (params.handoff) url.searchParams.set('handoff', params.handoff);
    if (params.error) url.searchParams.set('error', params.error);
    return url.toString();
  }

  /** Bir martalik: `getdel` atomik o'qib-o'chiradi. */
  async completeHandoff(handoff: string): Promise<TelegramOauthSession> {
    const raw = handoff ? await this.redis.getdel(handoffKey(handoff)) : null;
    if (!raw) {
      throw new BadRequestException(
        'Sessiya muddati tugadi. Iltimos, qaytadan kiring.',
      );
    }
    try {
      return JSON.parse(raw) as TelegramOauthSession;
    } catch {
      throw new BadRequestException(
        'Sessiya muddati tugadi. Iltimos, qaytadan kiring.',
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

    const payload = (await res.json().catch(() => null)) as {
      id_token?: string;
      error?: unknown;
      error_description?: unknown;
    } | null;

    // TELEGRAM XATONI HTTP 200 BILAN QAYTARADI. RFC 6749 §5.2 bo'yicha bu 400
    // bo'lishi kerak, shuning uchun yuqoridagi `!res.ok` tekshiruvi bunga
    // tushmaydi. Tasdiqlangan: soxta kod bilan so'rov `{"error":"invalid_grant"}`
    // + HTTP 200 qaytardi. Ya'ni javob tanasidagi `error` ni ALOHIDA
    // tekshirmasak, oqim «id_token yo'q» tarmog'iga tushib, sababi
    // ko'rinmay qoladi.
    if (payload?.error) {
      // `error` va `error_description` — OAuth xato KODLARI, maxfiy emas
      // (masalan `invalid_grant`, `invalid_client`). Token yoki secret emas.
      this.logger.warn(
        `Telegram token almashtirishni rad etdi: error=${describeValue(
          payload.error,
        )}${
          payload.error_description
            ? ` description=${describeValue(payload.error_description)}`
            : ''
        }`,
      );
      throw new UnauthorizedException(
        "Telegram kirishni tasdiqlamadi. Qaytadan urinib ko'ring.",
      );
    }

    const idToken = payload?.id_token;
    if (!idToken) {
      // KUZATUV: bu yo'l ilgari JIMGINA otilardi va foydalanuvchi ko'radigan
      // xabar `verify()` ning xatosi bilan bir xil, ya'ni logda hech narsa
      // qolmasdi. Qiymatlarni emas, faqat KALIT nomlarini yozamiz — tokenlar
      // logga tushmasligi kerak.
      this.logger.warn(
        `Telegram token javobida id_token yo'q. Kelgan kalitlar: ${
          payload
            ? Object.keys(payload).join(', ') || "(bo'sh obyekt)"
            : '(JSON emas)'
        }`,
      );
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }
    return idToken;
  }
}
