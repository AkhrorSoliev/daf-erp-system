import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { DebtListController } from './debt-list.controller';
import { DebtListService } from './debt-list.service';

describe('DebtListController — role guards', () => {
  let controller: DebtListController;
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const debts = {
    list: jest.fn().mockResolvedValue({}),
    student: jest.fn().mockResolvedValue({}),
    excel: jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('x'), filename: 'f.xlsx' }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DebtListController],
      providers: [{ provide: DebtListService, useValue: debts }],
    }).compile();
    controller = module.get(DebtListController);
  });

  const handlers = () => [
    controller.list,
    controller.student,
    controller.excel,
  ];
  const ctx = (roles: string[]) =>
    ({
      getHandler: () => controller.list,
      getClass: () => DebtListController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;

  it('the class is CEO / BD / Administrator / Cashier and no handler narrows or widens it', () => {
    expect(reflector.get(ROLES_KEY, DebtListController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
      'Cashier',
    ]);
    for (const h of handlers())
      expect(reflector.get(ROLES_KEY, h)).toBeUndefined();
  });

  it.each(['CEO', 'Branch Director', 'Administrator', 'Cashier'])(
    'allows %s',
    (role) => {
      expect(guard.canActivate(ctx([role]))).toBe(true);
    },
  );

  it.each(['Teacher', 'Student'])('denies %s', (role) => {
    expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
  });

  it('list passes the resolved scope', async () => {
    await controller.list({ tab: 'eski' } as never, 1001, [4]);
    expect(debts.list).toHaveBeenCalledWith(1001, [4], { tab: 'eski' });
  });

  it('the drawer gets the scope and the ceiling', async () => {
    await controller.student(10001, 1001, [4], [4, 5]);
    expect(debts.student).toHaveBeenCalledWith(1001, [4], [4, 5], 10001);
  });

  it('the Excel is an xlsx attachment named by the service', async () => {
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel({ tab: 'eski' } as never, 1001, null, res as never);
    expect(debts.excel).toHaveBeenCalledWith(1001, null, { tab: 'eski' });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="f.xlsx"',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('x'));
  });
});
