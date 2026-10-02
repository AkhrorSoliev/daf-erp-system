import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Telegram, TelegramError } from 'telegraf';
import {
  classifyTelegramError,
  describeError,
  installBotTokenRedaction,
  sendTelegramText,
} from './telegram-send';

// Invented: shaped like a bot token, belongs to no bot.
const TOKEN = '123456789:fake_secret-for-tests';
const SECRET = 'fake_secret-for-tests';
const TOKEN_URL = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

const tgError = (
  error_code: number,
  description: string,
  parameters?: { retry_after: number },
) => ({
  response: { error_code, description, parameters },
  message: description,
});

describe('classifyTelegramError', () => {
  it('treats 403 as permanent', () => {
    expect(
      classifyTelegramError(
        tgError(403, 'Forbidden: bot was blocked by the user'),
      ),
    ).toMatchObject({ kind: 'permanent', code: 403 });
  });

  it('treats "chat not found" as permanent', () => {
    expect(
      classifyTelegramError(tgError(400, 'Bad Request: chat not found')),
    ).toMatchObject({ kind: 'permanent', code: 400 });
  });

  it('treats any other 400 as a content error', () => {
    expect(
      classifyTelegramError(tgError(400, 'Bad Request: message is too long')),
    ).toMatchObject({
      kind: 'content',
      description: 'Bad Request: message is too long',
    });
  });

  it('treats 429 as transient and exposes retry_after', () => {
    expect(
      classifyTelegramError(
        tgError(429, 'Too Many Requests: retry after 3', { retry_after: 3 }),
      ),
    ).toMatchObject({ kind: 'transient', code: 429, retryAfter: 3 });
  });

  it('treats a network error as transient', () => {
    expect(classifyTelegramError(new Error('ETIMEDOUT'))).toMatchObject({
      kind: 'transient',
      code: null,
      description: 'ETIMEDOUT',
    });
  });

  it('keeps the bot token out of a network error description', () => {
    expect(
      classifyTelegramError(
        new Error(`request to ${TOKEN_URL} failed, reason: socket hang up`),
      ).description,
    ).toBe(
      'request to https://api.telegram.org/bot***/sendMessage failed, reason: socket hang up',
    );
  });
});

describe('sendTelegramText', () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const botWith = (sendMessage: jest.Mock) => ({ telegram: { sendMessage } });

  beforeEach(() => sleep.mockClear());

  it('returns the message id on success and passes the extra options through', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 77 });
    const outcome = await sendTelegramText(
      botWith(sendMessage),
      'chat-1',
      'hello',
      { parse_mode: 'HTML' },
      sleep,
    );
    expect(outcome).toEqual({ ok: true, messageId: 77 });
    expect(sendMessage).toHaveBeenCalledWith('chat-1', 'hello', {
      parse_mode: 'HTML',
    });
  });

  it('does not retry a permanent failure', async () => {
    const sendMessage = jest.fn().mockRejectedValue(tgError(403, 'Forbidden'));
    const outcome = await sendTelegramText(
      botWith(sendMessage),
      'c',
      't',
      {},
      sleep,
    );
    expect(outcome).toMatchObject({ ok: false, kind: 'permanent', code: 403 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('waits retry_after once on 429 and succeeds on the retry', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValueOnce(
        tgError(429, 'Too Many Requests', { retry_after: 2 }),
      )
      .mockResolvedValueOnce({ message_id: 5 });
    const outcome = await sendTelegramText(
      botWith(sendMessage),
      'c',
      't',
      {},
      sleep,
    );
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(outcome).toEqual({ ok: true, messageId: 5 });
  });

  it('gives up as transient after one 429 retry', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValue(tgError(429, 'Too Many Requests', { retry_after: 1 }));
    const outcome = await sendTelegramText(
      botWith(sendMessage),
      'c',
      't',
      {},
      sleep,
    );
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ ok: false, kind: 'transient', code: 429 });
  });

  it('does not wait when retry_after is longer than the cap', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValue(
        tgError(429, 'Too Many Requests', { retry_after: 120 }),
      );
    const outcome = await sendTelegramText(
      botWith(sendMessage),
      'c',
      't',
      {},
      sleep,
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' });
  });
});

describe('describeError', () => {
  it('prefers Error.message and falls back to String()', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('plain')).toBe('plain');
  });

  it('replaces every bot token in the text with bot***', () => {
    expect(
      describeError(new Error(`invalid json response body at ${TOKEN_URL}`)),
    ).toBe(
      'invalid json response body at https://api.telegram.org/bot***/sendMessage',
    );
    expect(describeError(`${TOKEN_URL} then ${TOKEN_URL}`)).toBe(
      'https://api.telegram.org/bot***/sendMessage then https://api.telegram.org/bot***/sendMessage',
    );
  });
});

/**
 * Telegraf hides the token only when the request itself fails. Once the
 * response arrives, node-fetch errors (a non-JSON body, a body cut off or
 * timed out) still carry the full URL, and so the token.
 */
describe('installBotTokenRedaction', () => {
  // A stand-in Bot API that answers every call with `reply`.
  let reply: { status: number; body: string };
  let server: Server;
  let telegram: Telegram;

  beforeAll(async () => {
    installBotTokenRedaction();
    server = createServer((_req, res) => {
      res.writeHead(reply.status, { 'content-type': 'text/html' });
      res.end(reply.body);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    telegram = new Telegram(TOKEN, { apiRoot: `http://127.0.0.1:${port}` });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('strips the token from an error Telegraf leaves unredacted', async () => {
    reply = { status: 404, body: '<html>Not Found</html>' };

    const err = (await telegram.getMe().catch((e: unknown) => e)) as Error & {
      type?: string;
    };

    expect(err.type).toBe('invalid-json');
    expect(err.message).toContain('/bot***/getMe');
    expect(err.message).not.toContain(SECRET);
    expect(err.stack).not.toContain(SECRET);
  });

  it('rethrows a Bot API refusal as it is, so it is still classified', async () => {
    reply = {
      status: 403,
      body: JSON.stringify({
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      }),
    };

    const err = await telegram.getMe().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TelegramError);
    expect(classifyTelegramError(err)).toMatchObject({
      kind: 'permanent',
      code: 403,
      description: 'Forbidden: bot was blocked by the user',
    });
  });
});
