import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentPromisesController } from './payment-promises.controller';
import { PaymentPromisesService } from './payment-promises.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('PaymentPromisesController — role guards', () => {
  let controller: PaymentPromisesController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
    findByStudent: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentPromisesController],
      providers: [{ provide: PaymentPromisesService, useValue: mockService }],
    }).compile();

    controller = module.get(PaymentPromisesController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function ctx(roles: string[]) {
    return {
      getHandler: () => controller.create,
      getClass: () => PaymentPromisesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    } as any;
  }

  it('class is guarded for CEO / BD / Administrator / Cashier', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, PaymentPromisesController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator', 'Cashier']);
  });

  it.each(['CEO', 'Branch Director', 'Administrator', 'Cashier'])(
    'allows %s',
    (role) => {
      expect(guard.canActivate(ctx([role]))).toBe(true);
    },
  );

  it('denies Teacher', () => {
    expect(() => guard.canActivate(ctx(['Teacher']))).toThrow(ForbiddenException);
  });

  it('delegates create to the service with userId + companyId', () => {
    const dto = { studentId: 10264, promiseDate: '2026-06-12', comment: 'x' };
    controller.create(dto, 99, 1001);
    expect(mockService.create).toHaveBeenCalledWith(dto, 99, 1001);
  });
});
