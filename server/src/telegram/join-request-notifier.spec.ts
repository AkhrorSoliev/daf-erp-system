import { JoinRequestNotifier } from './join-request-notifier';

function notifier(telegram: Record<string, jest.Mock> | null) {
  const service = {
    getBot: () => (telegram ? { telegram } : undefined),
  };
  const n = new JoinRequestNotifier(service as any);
  jest.spyOn((n as any).logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn((n as any).logger, 'error').mockImplementation(() => undefined);
  return n;
}

const MESSAGE = {
  chatId: '555444',
  text: '<b>salom</b>',
  photo: 'https://r2/p.jpg',
};

describe('JoinRequestNotifier', () => {
  it('is false without a bot', async () => {
    expect(await notifier(null).send(MESSAGE)).toBe(false);
  });

  it('sends the photo with the text as its caption', async () => {
    const telegram = {
      sendPhoto: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn(),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(true);
    expect(telegram.sendPhoto).toHaveBeenCalledWith(
      '555444',
      'https://r2/p.jpg',
      { caption: '<b>salom</b>', parse_mode: 'HTML' },
    );
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to text when the photo cannot go', async () => {
    const telegram = {
      sendPhoto: jest
        .fn()
        .mockRejectedValue(new Error('failed to get HTTP URL content')),
      sendMessage: jest.fn().mockResolvedValue({}),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '555444',
      '<b>salom</b>',
      {
        parse_mode: 'HTML',
      },
    );
  });

  it('sends text alone when there is no photo', async () => {
    const telegram = {
      sendPhoto: jest.fn(),
      sendMessage: jest.fn().mockResolvedValue({}),
    };
    expect(await notifier(telegram).send({ ...MESSAGE, photo: null })).toBe(
      true,
    );
    expect(telegram.sendPhoto).not.toHaveBeenCalled();
  });

  it('is false when nothing reaches the person', async () => {
    const blocked = new Error('403: Forbidden: bot was blocked by the user');
    const telegram = {
      sendPhoto: jest.fn().mockRejectedValue(blocked),
      sendMessage: jest.fn().mockRejectedValue(blocked),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(false);
  });

  describe('a chat that cannot be reached', () => {
    // How Telegraf raises a Bot API refusal.
    const blocked = Object.assign(new Error('403: Forbidden'), {
      response: {
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user',
      },
    });

    it('does not retry the photo as text, and only warns', async () => {
      const telegram = {
        sendPhoto: jest.fn().mockRejectedValue(blocked),
        sendMessage: jest.fn(),
      };
      const n = notifier(telegram);
      const logger = (n as any).logger as { warn: jest.Mock; error: jest.Mock };

      expect(await n.send(MESSAGE)).toBe(false);
      expect(telegram.sendMessage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("So'rov xabari yetkazilmadi (chat 555444)"),
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('only warns when the text alone is refused', async () => {
      const telegram = {
        sendPhoto: jest.fn(),
        sendMessage: jest.fn().mockRejectedValue(blocked),
      };
      const n = notifier(telegram);
      const logger = (n as any).logger as { warn: jest.Mock; error: jest.Mock };

      expect(await n.send({ ...MESSAGE, photo: null })).toBe(false);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  it('logs an error when a failure is not the chat (network, server)', async () => {
    const telegram = {
      sendPhoto: jest.fn(),
      sendMessage: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')),
    };
    const n = notifier(telegram);
    const logger = (n as any).logger as { warn: jest.Mock; error: jest.Mock };

    expect(await n.send({ ...MESSAGE, photo: null })).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ETIMEDOUT'),
    );
  });

  it('never writes the message text to the log — the approval carries the password', async () => {
    const password = 'Zx9-fake-Pq';
    const telegram = {
      sendPhoto: jest.fn().mockRejectedValue(new Error('photo failed')),
      sendMessage: jest.fn().mockRejectedValue(new Error('403: Forbidden')),
    };
    const n = notifier(telegram);
    const logger = (n as any).logger as { warn: jest.Mock; error: jest.Mock };

    await n.send({ ...MESSAGE, text: `🔑 Parol: <b>${password}</b>` });

    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining(password),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining(password),
    );
  });
});
