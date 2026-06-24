import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

const TOKEN_KEY = 'eskiz:token';
// Eskiz JWT tokens last ~30 days; cache for 25 to refresh comfortably early.
const TOKEN_TTL_SEC = 25 * 24 * 60 * 60;
const DEFAULT_BASE_URL = 'https://notify.eskiz.uz/api';
const DEFAULT_FROM = '4546'; // Eskiz test sender; replaced by the moderated brand nik.

export class EskizError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EskizError';
  }
}

export interface EskizSendResult {
  /** Eskiz dispatch id — equals `request_id` in delivery callbacks. */
  requestId?: string;
  /** Eskiz queue status, e.g. "waiting". */
  status: string;
}

/**
 * Thin client for the Eskiz.uz SMS gateway (notify.eskiz.uz).
 * - Logs in with email + API password, caches the JWT in Redis (~25d) and
 *   re-logs in on a 401.
 * - Sends a single SMS via POST /message/sms/send.
 *
 * Reference: docs/eskiz-uz/index.html. The message text MUST byte-match a
 * pre-moderated Eskiz template or the gateway rejects it.
 */
@Injectable()
export class EskizService {
  private readonly logger = new Logger(EskizService.name);
  private readonly baseUrl: string;
  private readonly email?: string;
  private readonly password?: string;
  private readonly from: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.baseUrl = this.config.get<string>('ESKIZ_BASE_URL', DEFAULT_BASE_URL);
    this.email = this.config.get<string>('ESKIZ_EMAIL');
    this.password = this.config.get<string>('ESKIZ_PASSWORD');
    this.from = this.config.get<string>('ESKIZ_FROM', DEFAULT_FROM);
  }

  /** Whether credentials are present (so callers can degrade gracefully). */
  isConfigured(): boolean {
    return Boolean(this.email && this.password);
  }

  /**
   * Normalize a phone to Eskiz form `998XXXXXXXXX` (12 digits, no '+').
   * Accepts the DB's 9-digit form or an already-prefixed 12-digit form.
   */
  normalizePhone(phone: string): string {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (digits.length === 9) return `998${digits}`;
    if (digits.length === 12 && digits.startsWith('998')) return digits;
    throw new EskizError(`Eskiz uchun telefon raqam noto'g'ri: ${phone}`);
  }

  async sendSms(phone: string, message: string): Promise<EskizSendResult> {
    if (!this.isConfigured()) {
      throw new EskizError('Eskiz sozlanmagan (ESKIZ_EMAIL/ESKIZ_PASSWORD yo`q)');
    }
    const mobile = this.normalizePhone(phone);

    let token = await this.getToken();
    let res = await this.postSend(mobile, message, token);
    if (res.status === 401) {
      // Token expired/invalid — force a fresh login once and retry.
      token = await this.getToken(true);
      res = await this.postSend(mobile, message, token);
    }

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      this.logger.warn(
        `Eskiz send failed (${res.status}): ${JSON.stringify(json)}`,
      );
      throw new EskizError(`Eskiz send failed: ${res.status}`);
    }
    return { requestId: json?.id, status: json?.status ?? 'unknown' };
  }

  private postSend(mobile: string, message: string, token: string) {
    const form = new FormData();
    form.append('mobile_phone', mobile);
    form.append('message', message);
    form.append('from', this.from);
    return fetch(`${this.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.redis.get(TOKEN_KEY);
      if (cached) return cached;
    }
    return this.login();
  }

  private async login(): Promise<string> {
    if (!this.email || !this.password) {
      throw new EskizError('Eskiz sozlanmagan (ESKIZ_EMAIL/ESKIZ_PASSWORD yo`q)');
    }
    const form = new FormData();
    form.append('email', this.email);
    form.append('password', this.password);

    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      throw new EskizError(`Eskiz login failed: ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as any;
    const token: string | undefined = json?.data?.token;
    if (!token) {
      throw new EskizError('Eskiz login: token qaytmadi');
    }
    await this.redis.set(TOKEN_KEY, token, 'EX', TOKEN_TTL_SEC);
    return token;
  }
}
