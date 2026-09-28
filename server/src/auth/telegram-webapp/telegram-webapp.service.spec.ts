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
  SEVERAL_STAFF_ACCOUNTS_MESSAGE,
  STAFF_SIGN_IN_DISABLED_MESSAGE,
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

const DOSTON = {
  id: 30401,
  firstName: 'Doston',
  password: '$2a$10$hash',
  roles: [{ role: { id: 4, name: 'Teacher' } }],
};
const GULNOZA = {
  id: 30402,
  firstName: 'Gulnoza',
  password: '$2a$10$hash',
  roles: [{ role: { id: 3, name: 'Administrator' } }],
};

function makeService(
  opts: { token?: string; linked?: unknown[]; staff?: unknown[] } = {},
) {
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
  const staffSession = {
    accessToken: 'staff-access',
    refreshToken: 'staff-refresh',
    user: { id: DOSTON.id },
  };
  const authService = {
    buildStudentSession: jest.fn().mockResolvedValue(session),
    findStaffAccountsByTelegram: jest.fn().mockResolvedValue(opts.staff ?? []),
    login: jest.fn().mockResolvedValue(staffSession),
  };
  const service = new TelegramWebAppService(
    config as any,
    prisma as any,
    authService as any,
  );
  return { service, prisma, authService, session, staffSession };
}

describe('TelegramWebAppService.signIn', () => {
  it("bog'lanmagan Telegram akkaunt uchun `not_registered` qaytaradi — sessiya ham, xato ham emas", async () => {
    const { service, authService } = makeService({ linked: [] });

    await expect(service.signIn(initDataFor())).resolves.toEqual({
      status: 'not_registered',
    });
    expect(authService.buildStudentSession).not.toHaveBeenCalled();
  });

  it("o'quvchi bog'lanmagan, lekin Telegram xodimniki bo'lsa — `staff`: xodim kabinetiga yo'l ko'rsatiladi (ADR-0045)", async () => {
    const { service, authService } = makeService({
      linked: [],
      staff: [DOSTON],
    });

    await expect(service.signIn(initDataFor())).resolves.toEqual({
      status: 'staff',
    });
    expect(authService.findStaffAccountsByTelegram).toHaveBeenCalledWith(
      String(TG_USER_ID),
      [1, 2, 3, 4, 5],
      1,
    );
    expect(authService.buildStudentSession).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("o'quvchi bog'langan bo'lsa xodim qidirilmaydi — o'quvchi kabineti avvalgidek ochiladi", async () => {
    const { service, authService } = makeService({
      linked: [DILNOZA],
      staff: [DOSTON],
    });

    const result = await service.signIn(initDataFor());

    expect(result.status).toBe('authenticated');
    expect(authService.findStaffAccountsByTelegram).not.toHaveBeenCalled();
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

describe('TelegramWebAppService.signInStaff (ADR-0045)', () => {
  const LEHRER = 'https://lehrer.dafzentrum.uz';
  const ADMIN = 'https://admin.dafzentrum.uz';

  it("ustoz portalida faqat ustoz rolini qidiradi va parol yo'lidagi `login` bilan sessiya beradi", async () => {
    const { service, authService, staffSession } = makeService({
      staff: [DOSTON],
    });

    await expect(service.signInStaff(initDataFor(), LEHRER)).resolves.toEqual({
      status: 'authenticated',
      ...staffSession,
    });
    expect(authService.findStaffAccountsByTelegram).toHaveBeenCalledWith(
      String(TG_USER_ID),
      [4],
    );
    // Portal darvozasi parol bilan kirishdagi funksiyada yana tekshiriladi.
    expect(authService.login).toHaveBeenCalledWith(DOSTON, LEHRER);
  });

  it('admin portalida admin rollarini qidiradi', async () => {
    const { service, authService } = makeService({ staff: [GULNOZA] });

    await service.signInStaff(initDataFor(), ADMIN);

    expect(authService.findStaffAccountsByTelegram).toHaveBeenCalledWith(
      String(TG_USER_ID),
      [1, 2, 3, 5],
    );
    expect(authService.login).toHaveBeenCalledWith(GULNOZA, ADMIN);
  });

  it("lokal dev'da (portal cheklovi yo'q) barcha xodim rollarini qidiradi", async () => {
    const { service, authService } = makeService({ staff: [DOSTON] });

    await service.signInStaff(initDataFor(), 'http://localhost:3000');

    expect(authService.findStaffAccountsByTelegram).toHaveBeenCalledWith(
      String(TG_USER_ID),
      [1, 2, 3, 4, 5],
    );
  });

  it("o'quvchi portalidan faqat o'quvchi roli uzatiladi — qidiruv uni tashlab yuboradi", async () => {
    const { service, authService } = makeService({ staff: [] });

    await expect(
      service.signInStaff(initDataFor(), 'https://student.dafzentrum.uz'),
    ).resolves.toEqual({ status: 'not_registered' });
    expect(authService.findStaffAccountsByTelegram).toHaveBeenCalledWith(
      String(TG_USER_ID),
      [6],
    );
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("bog'lanmagan Telegram uchun `not_registered` — xato emas, sessiya ham emas", async () => {
    const { service, authService } = makeService({ staff: [] });

    await expect(service.signInStaff(initDataFor(), LEHRER)).resolves.toEqual({
      status: 'not_registered',
    });
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("bir nechta xodim hisobi bog'langan bo'lsa — yopiq holat, «g'olib» tanlanmaydi", async () => {
    const { service, authService } = makeService({
      staff: [DOSTON, { ...DOSTON, id: 30403 }],
    });
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const attempt = service.signInStaff(initDataFor(), LEHRER);

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow(SEVERAL_STAFF_ACCOUNTS_MESSAGE);
    expect(authService.login).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("parolsiz hisobni kiritmaydi — parol yo'li ham, Telegram OAuth ham kiritmaydi", async () => {
    const { service, authService } = makeService({
      staff: [{ ...DOSTON, password: null }],
    });

    const attempt = service.signInStaff(initDataFor(), LEHRER);

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow(STAFF_SIGN_IN_DISABLED_MESSAGE);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it("`login` rad etsa (portal darvozasi) — xato o'zgarmay o'tadi", async () => {
    const { service, authService } = makeService({ staff: [DOSTON] });
    authService.login.mockRejectedValue(
      new ForbiddenException(
        'Sizning rolingiz bu portalga kirish huquqiga ega emas',
      ),
    );

    await expect(
      service.signInStaff(initDataFor(), LEHRER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('imzosi buzilgan satrda bazaga bormaydi', async () => {
    const { service, authService } = makeService({ staff: [DOSTON] });
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const attempt = service.signInStaff(
      initDataFor(TG_USER_ID, undefined, '987654321:AAAnotherBotsToken'),
      LEHRER,
    );

    await expect(attempt).rejects.toThrow(INIT_DATA_INVALID_MESSAGE);
    expect(authService.findStaffAccountsByTelegram).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("bot tokeni sozlanmagan bo'lsa 503", async () => {
    const { service, authService } = makeService({ token: '' });

    await expect(
      service.signInStaff(initDataFor(), LEHRER),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(authService.findStaffAccountsByTelegram).not.toHaveBeenCalled();
  });
});
