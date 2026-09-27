import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../common/decorators';
import { IpThrottlerGuard } from '../../common/guards';
import { AuthModule } from '../auth.module';
import { TelegramWebAppLoginDto } from '../dto/telegram-webapp-login.dto';
import { TelegramWebAppController } from './telegram-webapp.controller';
import { TelegramWebAppService } from './telegram-webapp.service';

describe('TelegramWebAppController', () => {
  it("@Public(): Mini App'ni ochgan odamda hali sessiya yo'q", () => {
    expect(
      new Reflector().get<boolean>(
        IS_PUBLIC_KEY,
        TelegramWebAppController.prototype.signIn,
      ),
    ).toBe(true);
  });

  it('IpThrottlerGuard bilan himoyalangan', () => {
    const guards =
      (Reflect.getMetadata(
        '__guards__',
        TelegramWebAppController.prototype.signIn,
      ) as unknown[]) ?? [];
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('initData va tanlangan studentId ni servisga uzatadi', async () => {
    const service = {
      signIn: jest.fn().mockResolvedValue({ status: 'not_registered' }),
    };
    const controller = new TelegramWebAppController(service as any);

    await expect(
      controller.signIn({ initData: 'auth_date=1&hash=x', studentId: 10501 }),
    ).resolves.toEqual({ status: 'not_registered' });
    expect(service.signIn).toHaveBeenCalledWith('auth_date=1&hash=x', 10501);
  });

  // `new` bilan yasash Nest konteynerini chetlab o'tadi; bu test konstruktorni
  // haqiqiy injector orqali yechadi (auth.controller.spec.ts'dagi usul).
  it("Nest DI orqali yechiladi va AuthModule'da ro'yxatdan o'tgan", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
      ],
      providers: [
        TelegramWebAppController,
        IpThrottlerGuard,
        { provide: TelegramWebAppService, useValue: {} },
      ],
    }).compile();
    expect(moduleRef.get(TelegramWebAppController)).toBeInstanceOf(
      TelegramWebAppController,
    );

    expect(Reflect.getMetadata('controllers', AuthModule)).toContain(
      TelegramWebAppController,
    );
    expect(Reflect.getMetadata('providers', AuthModule)).toContain(
      TelegramWebAppService,
    );
  });
});

/** `main.ts` dagi global pipe sozlamalari bilan. */
describe('TelegramWebAppLoginDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const meta = { type: 'body' as const, metatype: TelegramWebAppLoginDto };

  it("initData'ni o'zi, studentId'ni ixtiyoriy qabul qiladi", async () => {
    await expect(
      pipe.transform({ initData: 'auth_date=1' }, meta),
    ).resolves.toEqual({ initData: 'auth_date=1' });
    await expect(
      pipe.transform({ initData: 'auth_date=1', studentId: 10501 }, meta),
    ).resolves.toEqual({ initData: 'auth_date=1', studentId: 10501 });
  });

  it.each([
    ["initData yo'q", {}],
    ["initData bo'sh", { initData: '' }],
    ['initData juda uzun', { initData: 'a'.repeat(4097) }],
    ['studentId butun emas', { initData: 'x', studentId: 1.5 }],
    ['studentId musbat emas', { initData: 'x', studentId: 0 }],
    [
      "begona maydon (masalan telegramUserId o'zi yuborilsa)",
      {
        initData: 'x',
        telegramUserId: '700000001',
      },
    ],
  ])('rad etadi: %s', async (_label, body) => {
    await expect(pipe.transform(body, meta)).rejects.toThrow();
  });
});
