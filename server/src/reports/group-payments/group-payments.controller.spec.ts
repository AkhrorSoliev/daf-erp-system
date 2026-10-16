import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { GroupPaymentsController } from './group-payments.controller';
import { GroupPaymentsService } from './group-payments.service';

describe('GroupPaymentsController', () => {
  const service = {
    rows: jest.fn().mockResolvedValue({}),
    group: jest.fn().mockResolvedValue({}),
  };
  let controller: GroupPaymentsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [GroupPaymentsController],
      providers: [{ provide: GroupPaymentsService, useValue: service }],
    }).compile();
    controller = module.get(GroupPaymentsController);
  });

  it.each(['rows', 'group'])(
    '%s is gated by reports.payments and admits CEO, Branch Director and Administrator',
    (method) => {
      expect(routeAccess(GroupPaymentsController, method)).toEqual({
        kind: 'can',
        keys: ['reports.payments'],
      });
      expect(defaultRolesOf(GroupPaymentsController, method)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('rows passes the company, the resolved scope and the query', async () => {
    const q = { oy: '2026-10', kesim: 'ustoz' as const };
    await controller.rows(q, 1001, [3, 7]);
    expect(service.rows).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('group passes the group id and the month', async () => {
    await controller.group('g1', { oy: '2026-10' }, 1001, [4]);
    expect(service.group).toHaveBeenCalledWith(1001, [4], 'g1', '2026-10');
  });
});
