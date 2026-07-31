import { TelegramOauthConfig } from './telegram-oauth.config';

function makeConfig(env: Record<string, string | undefined>) {
  const configService = {
    get: (key: string) => env[key],
  } as any;
  return new TelegramOauthConfig(configService);
}

describe('TelegramOauthConfig', () => {
  const full = {
    TELEGRAM_OAUTH_CLIENT_ID: '1234567890',
    TELEGRAM_OAUTH_CLIENT_SECRET: 'secret-value',
    TELEGRAM_OAUTH_REDIRECT_URI: 'https://api.dafzentrum.uz/api/auth/telegram/callback',
  };

  it("hamma sozlama bo'lsa yoniq", () => {
    const config = makeConfig(full);
    expect(config.enabled).toBe(true);
    expect(config.clientId).toBe('1234567890');
    expect(config.redirectUri).toBe(
      'https://api.dafzentrum.uz/api/auth/telegram/callback',
    );
  });

  it.each([
    ['TELEGRAM_OAUTH_CLIENT_ID'],
    ['TELEGRAM_OAUTH_CLIENT_SECRET'],
    ['TELEGRAM_OAUTH_REDIRECT_URI'],
  ])("%s bo'lmasa o'chiq", (missing) => {
    const config = makeConfig({ ...full, [missing]: undefined });
    expect(config.enabled).toBe(false);
  });

  it("bo'sh satrni ham yo'q deb hisoblaydi", () => {
    const config = makeConfig({ ...full, TELEGRAM_OAUTH_CLIENT_SECRET: '   ' });
    expect(config.enabled).toBe(false);
  });
});
