import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { PaymentsListController } from './payments-list.controller';
import { PaymentsListService } from './payments-list.service';

describe('PaymentsListController — route access', () => {
  const list = { rows: jest.fn().mockResolvedValue({}) };
  let controller: PaymentsListController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsListController],
      providers: [{ provide: PaymentsListService, useValue: list }],
    }).compile();
    controller = module.get(PaymentsListController);
  });

  it('rows is gated by the payments view capability', () => {
    expect(routeAccess(PaymentsListController, 'rows')).toEqual({
      kind: 'can',
      keys: ['payments.view'],
    });
  });

  it('rows admits the three admin roles and the Cashier by default, not the Teacher', () => {
    expect(defaultRolesOf(PaymentsListController, 'rows')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Cashier',
    ]);
  });

  it('rows passes the company, the resolved scope and the query', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    await controller.rows(q as never, 1001, [4]);
    expect(list.rows).toHaveBeenCalledWith(1001, [4], q);
  });
});
