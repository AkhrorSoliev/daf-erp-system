import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { PaymentsListController } from './payments-list.controller';
import { PaymentsListService } from './payments-list.service';

describe('PaymentsListController — route access', () => {
  const list = {
    rows: jest.fn().mockResolvedValue({}),
    row: jest.fn().mockResolvedValue({}),
    summary: jest.fn().mockResolvedValue({}),
    filterOptions: jest.fn().mockResolvedValue({}),
    excel: jest.fn().mockResolvedValue({
      buffer: Buffer.from('xlsx'),
      filename: 'tolovlar-2026-10-01-2026-10-31.xlsx',
    }),
  };
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

  it('the drawer and the filter menus are gated by payments.view, the summary by reports.finance', () => {
    expect(routeAccess(PaymentsListController, 'row')).toEqual({
      kind: 'can',
      keys: ['payments.view'],
    });
    expect(routeAccess(PaymentsListController, 'filterOptions')).toEqual({
      kind: 'can',
      keys: ['payments.view'],
    });
    expect(routeAccess(PaymentsListController, 'summary')).toEqual({
      kind: 'can',
      keys: ['reports.finance'],
    });
  });

  it('default roles: the drawer and menus the four, the summary only CEO and Branch Director', () => {
    const four = ['Administrator', 'Branch Director', 'CEO', 'Cashier'];
    expect(defaultRolesOf(PaymentsListController, 'row')).toEqual(four);
    expect(defaultRolesOf(PaymentsListController, 'filterOptions')).toEqual(
      four,
    );
    expect(defaultRolesOf(PaymentsListController, 'summary')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('row, summary and filterOptions pass the company, the scope and their arguments', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    await controller.row('p1', q, 1001, [4]);
    expect(list.row).toHaveBeenCalledWith(1001, [4], 'p1', q);
    await controller.summary(q, 1001, [4]);
    expect(list.summary).toHaveBeenCalledWith(1001, [4], q);
    await controller.filterOptions(1001, [4]);
    expect(list.filterOptions).toHaveBeenCalledWith(1001, [4]);
  });

  it('excel is gated by payments.view, open to the four roles by default', () => {
    expect(routeAccess(PaymentsListController, 'excel')).toEqual({
      kind: 'can',
      keys: ['payments.view'],
    });
    expect(defaultRolesOf(PaymentsListController, 'excel')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Cashier',
    ]);
  });

  it('excel sends the workbook as an attachment with the three headers', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel(q as never, 1001, [4], res as never);
    expect(list.excel).toHaveBeenCalledWith(1001, [4], q);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="tolovlar-2026-10-01-2026-10-31.xlsx"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 4);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
});
