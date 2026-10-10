import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

// Kassir pul qaytarmaydi (docs/role-access.md, «Create refund»). Qarzdorlik
// sahifasining «Muzlatilgan puli» tabi shu sababli kassirga qator amallarini
// ko'rsatmaydi — bu test o'sha yashirishning server tomoni.
describe('RefundsController — role guards', () => {
  let controller: RefundsController;
  let guard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundsController],
      providers: [{ provide: RefundsService, useValue: {} }],
    }).compile();

    controller = module.get(RefundsController);
    guard = new RolesGuard(new Reflector());
  });

  function ctx(handler: (...args: unknown[]) => unknown, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => RefundsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('class-level @Roles is CEO, Branch Director, Administrator', () => {
    expect(new Reflector().get<string[]>(ROLES_KEY, RefundsController)).toEqual(
      ['CEO', 'Branch Director', 'Administrator'],
    );
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator']])(
    'quickRefund allows %s',
    (role) => {
      expect(guard.canActivate(ctx(controller.quickRefund, [role]))).toBe(true);
    },
  );

  it.each([['Cashier'], ['Teacher']])('quickRefund denies %s', (role) => {
    expect(() =>
      guard.canActivate(ctx(controller.quickRefund, [role])),
    ).toThrow(ForbiddenException);
  });

  // ADR-0076: «Berildi» and «Bekor qilish» replace the old approve/complete
  // route, so nothing may pay out through it any more.
  it('has no PATCH :id/process handler', () => {
    expect('process' in controller).toBe(false);
  });

  it('reverse is CEO-only', () => {
    expect(() =>
      guard.canActivate(ctx(controller.reverse, ['Branch Director'])),
    ).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(controller.reverse, ['CEO']))).toBe(true);
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator'], ['Cashier']])(
    'handOver («Berildi») allows %s',
    (role) => {
      expect(guard.canActivate(ctx(controller.handOver, [role]))).toBe(true);
    },
  );

  it('handOver denies Teacher', () => {
    expect(() =>
      guard.canActivate(ctx(controller.handOver, ['Teacher'])),
    ).toThrow(ForbiddenException);
  });

  it.each([['CEO'], ['Branch Director']])('cancel allows %s', (role) => {
    expect(guard.canActivate(ctx(controller.cancel, [role]))).toBe(true);
  });

  it.each([['Administrator'], ['Cashier'], ['Teacher']])(
    'cancel denies %s',
    (role) => {
      expect(() => guard.canActivate(ctx(controller.cancel, [role]))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('the history list is open to the Cashier, not the Teacher', () => {
    expect(guard.canActivate(ctx(controller.findAll, ['Cashier']))).toBe(true);
    expect(() =>
      guard.canActivate(ctx(controller.findAll, ['Teacher'])),
    ).toThrow(ForbiddenException);
  });
});
