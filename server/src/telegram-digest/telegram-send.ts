import { Telegram } from 'telegraf';

export type TelegramFailureKind = 'permanent' | 'content' | 'transient';

export interface TelegramFailure {
  kind: TelegramFailureKind;
  code: number | null;
  description: string;
}

export type SendOutcome =
  | { ok: true; messageId: number }
  | ({ ok: false } & TelegramFailure);

/** The one Telegraf method the digest needs; both bots satisfy it. */
export interface TelegramTextSender {
  telegram: {
    sendMessage(
      chatId: string,
      text: string,
      extra?: any,
    ): Promise<{ message_id: number }>;
  };
}

/** Longest `retry_after` a 429 may ask for before we give up for this run. */
export const MAX_RETRY_AFTER_SECONDS = 30;

/** Bad Requests that mean the chat itself is gone — retrying cannot help. */
const PERMANENT_BAD_REQUEST =
  /chat not found|user is deactivated|bot was blocked|bot was kicked|PEER_ID_INVALID/i;

/**
 * A Bot API call goes to `…/bot<token>/<method>`, and a failed call's error
 * can quote that URL. Error text that is stored or logged comes through here.
 */
function redactBotToken(text: string): string {
  return text.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***');
}

export function describeError(err: unknown): string {
  return redactBotToken(err instanceof Error ? err.message : String(err));
}

/**
 * Strips the bot token from every error a Telegram API call throws, at the one
 * method all of them go through: both bots, and the per-update client behind
 * `ctx.reply`. Telegraf itself redacts only a request that fails outright; an
 * error raised once the response is in (a non-JSON body, a body cut off or
 * timed out) still quotes the URL, and dozens of handlers log `err.message`.
 * The same error object is rethrown, so `TelegramError.response` still reaches
 * `classifyTelegramError`. Installed once, from `main.ts`.
 */
export function installBotTokenRedaction(): void {
  const proto = Telegram.prototype as unknown as {
    callApi: (...args: unknown[]) => Promise<unknown>;
  };
  const callApi = proto.callApi;
  proto.callApi = async function (this: unknown, ...args: unknown[]) {
    try {
      return await Reflect.apply(callApi, this, args);
    } catch (err) {
      if (err instanceof Error) {
        err.message = redactBotToken(err.message);
        if (err.stack) err.stack = redactBotToken(err.stack);
      }
      throw err;
    }
  };
}

/**
 * Sorts a Telegraf error into what the digest crons do with the rows:
 * permanent → drop; content (our own bug: too long, bad HTML) → keep and
 * log loudly; transient (network, 5xx, rate limit) → keep for the next run.
 */
export function classifyTelegramError(
  err: unknown,
): TelegramFailure & { retryAfter: number | null } {
  const e = err as {
    response?: {
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };
  };
  const rawCode = e?.response?.error_code;
  const code = typeof rawCode === 'number' ? rawCode : null;
  const description = e?.response?.description ?? describeError(err);

  if (code === 403) {
    return { kind: 'permanent', code, description, retryAfter: null };
  }
  if (code === 400) {
    const kind = PERMANENT_BAD_REQUEST.test(description)
      ? 'permanent'
      : 'content';
    return { kind, code, description, retryAfter: null };
  }
  if (code === 429) {
    const retryAfter = e.response?.parameters?.retry_after ?? 1;
    return { kind: 'transient', code, description, retryAfter };
  }
  return { kind: 'transient', code, description, retryAfter: null };
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one message. On 429 it waits `retry_after` (at most 30 s) and retries
 * once; every other failure is returned, classified, for the caller to act on.
 */
export async function sendTelegramText(
  bot: TelegramTextSender,
  chatId: string,
  text: string,
  extra: Record<string, unknown>,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<SendOutcome> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const message = await bot.telegram.sendMessage(chatId, text, extra);
      return { ok: true, messageId: message.message_id };
    } catch (err) {
      const failure = classifyTelegramError(err);
      const wait = failure.retryAfter;
      if (attempt === 1 && wait !== null && wait <= MAX_RETRY_AFTER_SECONDS) {
        await sleep(wait * 1000);
        continue;
      }
      return {
        ok: false,
        kind: failure.kind,
        code: failure.code,
        description: failure.description,
      };
    }
  }
}
