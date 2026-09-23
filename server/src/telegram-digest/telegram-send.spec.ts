import {
  classifyTelegramError,
  describeError,
  sendTelegramText,
} from './telegram-send';

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
});
