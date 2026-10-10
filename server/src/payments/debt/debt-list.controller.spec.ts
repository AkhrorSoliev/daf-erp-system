import { Test } from '@nestjs/testing';
import { ACCESS_KEY } from '../../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { DebtListController } from './debt-list.controller';
import { DebtListService } from './debt-list.service';

describe('DebtListController — route access', () => {
  const debts = {
    list: jest.fn().mockResolvedValue({}),
    student: jest.fn().mockResolvedValue({}),
    excel: jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('x'), filename: 'f.xlsx' }),
  };
  let controller: DebtListController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DebtListController],
      providers: [{ provide: DebtListService, useValue: debts }],
    }).compile();
    controller = module.get(DebtListController);
  });

  const HANDLERS = ['list', 'student', 'excel'] as const;

  it('the class level carries the debt view capability and no handler overrides it', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, DebtListController)).toEqual({
      kind: 'can',
      keys: ['debt.view'],
    });
    for (const name of HANDLERS) {
      expect(Reflect.getMetadata(ACCESS_KEY, controller[name])).toBeUndefined();
    }
  });

  it.each(HANDLERS)('%s is gated by the debt view capability', (name) => {
    expect(routeAccess(DebtListController, name)).toEqual({
      kind: 'can',
      keys: ['debt.view'],
    });
  });

  it.each(HANDLERS)(
    '%s admits the three admin roles and the Cashier by default, not the Teacher',
    (name) => {
      expect(defaultRolesOf(DebtListController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
      ]);
    },
  );

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
