import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { INIT_DATA_MAX_AGE_SEC } from './telegram-init-data';
import {
  INIT_DATA_EXPIRED_MESSAGE,
  INIT_DATA_INVALID_MESSAGE,
  NOT_LINKED_STUDENT_MESSAGE,
  NO_ACCOUNT_MESSAGE,
  TelegramWebAppService,
  WEBAPP_DISABLED_MESSAGE,
} from './telegram-webapp.service';

const TOKEN = '123456789:AAFakeBotTokenForTestsOnly';
const TG_USER_ID = 700000001;

/** Telegram'ning hujjatlashtirilgan algoritmi bilan (spec'dagi alohida nusxa). */
function initDataFor(
  userId: number = TG_USER_ID,
  authDate = Math.floor(Date.now() / 1000),
  token = TOKEN,
): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: userId, first_name: 'Dilnoza' }),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const DILNOZA = {
  id: 10501,
  firstName: 'Dilnoza',
  lastName: 'Karimova',
  userId: 20501,
};
const SARDOR = {
  id: 10502,
  firstName: 'Sardor',
  lastName: 'Karimov',
  userId: 20502,
};

function makeService(opts: { token?: string; linked?: unknown[] } = {}) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'TELEGRAM_BOT_TOKEN' ? (opts.token ?? TOKEN) : undefined,
    ),
  };
  const prisma = {
    student: { findMany: jest.fn().mockResolvedValue(opts.linked ?? []) },
  };
  const session = {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: DILNOZA.userId, studentId: DILNOZA.id },
  };
  const authService = {
    buildStudentSession: jest.fn().mockResolvedValue(session),
  };
  const service = new TelegramWebAppService(
    config as any,
    prisma as any,
    authService as any,
  );
  return { service, prisma, authService, session };
}

describe('TelegramWebAppService.signIn', () => {
  it("bog'lanmagan Telegram akkaunt uchun `not_registered` qaytaradi — sessiya ham, xato ham emas", async () => {
    const { service, authService } = makeService({ linked: [] });

    await expect(service.signIn(initDataFor())).resolves.toEqual({
      status: 'not_registered',
    });
    expect(authService.buildStudentSession).not.toHaveBeenCalled();
  });

  it("o'quvchilarni Telegram id bo'yicha, arxivdagilarsiz qidiradi", async () => {
    const { service, prisma } = makeService({ linked: [] });

    await service.signIn(initDataFor());

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { telegramChatId: String(TG_USER_ID), deletedAt: null },
      }),
    );
  });

  it("bitta bog'langan o'quvchini to'g'ridan-to'g'ri kiritadi", async () => {
    const { service, authService, session } = makeService({
      linked: [DILNOZA],
    });

    await expect(service.signIn(initDataFor())).resolves.toEqual({
      status: 'authenticated',
      ...session,
    });
    expect(authService.buildStudentSession).toHaveBeenCalledWith(
      DILNOZA.userId,
    );
  });

  it("bir nechta farzand bog'langan bo'lsa — tanlash ro'yxati (faqat ism va id)", async () => {
    const { service, authService } = makeService({
      linked: [DILNOZA, SARDOR],
    });

    await expect(service.signIn(initDataFor())).resolves.toEqual({
      status: 'choose',
      students: [
        { id: DILNOZA.id, firstName: 'Dilnoza', lastName: 'Karimova' },
        { id: SARDOR.id, firstName: 'Sardor', lastName: 'Karimov' },
      ],
    });
    expect(authService.buildStudentSession).not.toHaveBeenCalled();
  });

  it('tanlangan farzandning hisobiga kiritadi', async () => {
    const { service, authService } = makeService({
      linked: [DILNOZA, SARDOR],
    });

    const result = await service.signIn(initDataFor(), SARDOR.id);

    expect(result.status).toBe('authenticated');
    expect(authService.buildStudentSession).toHaveBeenCalledWith(SARDOR.userId);
  });

  it("bu Telegram'ga bog'lanmagan o'quvchini tanlashni rad etadi", async () => {
    const { service, authService } = makeService({
      linked: [DILNOZA, SARDOR],
    });

    const attempt = service.signIn(initDataFor(), 10999);

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(NOT_LINKED_STUDENT_MESSAGE);
    expect(authService.buildStudentSession).not.toHaveBeenCalled();
  });

  it("yagona o'quvchi bo'lsa ham boshqa id so'ralsa rad etadi", async () => {
    const { service } = makeService({ linked: [DILNOZA] });

    await expect(
      service.signIn(initDataFor(), SARDOR.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hisobi yo'q kartani ro'yxatga qo'ymaydi; qolgan yagonasiga kiritadi", async () => {
    const { service, authService } = makeService({
      linked: [{ ...SARDOR, userId: null }, DILNOZA],
    });

    const result = await service.signIn(initDataFor());

    expect(result.status).toBe('authenticated');
    expect(authService.buildStudentSession).toHaveBeenCalledWith(
      DILNOZA.userId,
    );
  });

  it("bog'langan kartalarning hech birida hisob bo'lmasa — botdagi xabar bilan rad", async () => {
    const { service } = makeService({
      linked: [{ ...DILNOZA, userId: null }],
    });

    const attempt = service.signIn(initDataFor());

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow(NO_ACCOUNT_MESSAGE);
  });

  it("bloklangan hisob kabi rad etishlarni `buildStudentSession` dan o'zgartirmay o'tkazadi", async () => {
    const { service, authService } = makeService({ linked: [DILNOZA] });
    authService.buildStudentSession.mockRejectedValue(
      new UnauthorizedException('Hisobingiz bloklangan'),
    );

    await expect(service.signIn(initDataFor())).rejects.toThrow(
      'Hisobingiz bloklangan',
    );
  });

  describe('initData', () => {
    it('boshqa bot imzolagan satrni rad etadi va bazaga bormaydi', async () => {
      const { service, prisma } = makeService({ linked: [DILNOZA] });
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const forged = initDataFor(
        TG_USER_ID,
        undefined,
        '987654321:AAAnotherBotsToken',
      );

      const attempt = service.signIn(forged);

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toThrow(INIT_DATA_INVALID_MESSAGE);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
      // Logga sabab yoziladi, satrning o'zi emas.
      expect(warn).toHaveBeenCalledWith(
        'Mini App initData rad etildi: bad_signature',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('hash=');
      warn.mockRestore();
    });

    it("eskirgan satrga Mini App'ni qayta ochishni aytadi", async () => {
      const { service, prisma } = makeService({ linked: [DILNOZA] });
      const stale = Math.floor(Date.now() / 1000) - INIT_DATA_MAX_AGE_SEC - 5;

      const attempt = service.signIn(initDataFor(TG_USER_ID, stale));

      await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(attempt).rejects.toThrow(INIT_DATA_EXPIRED_MESSAGE);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  it("bot tokeni sozlanmagan bo'lsa 503 — funksiya o'chiq", async () => {
    const { service, prisma } = makeService({ token: '  ' });

    const attempt = service.signIn(initDataFor());

    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(attempt).rejects.toThrow(WEBAPP_DISABLED_MESSAGE);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});
