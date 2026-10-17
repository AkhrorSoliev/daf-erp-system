import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { ReportsController } from '../reports.controller';
import { DepartedController } from './departed.controller';
import { DepartedListService } from './departed-list.service';
import { DepartedOverviewService } from './departed-overview.service';

describe('DepartedController', () => {
  const overviewService = { overview: jest.fn().mockResolvedValue({}) };
  const listService = {
    list: jest.fn().mockResolvedValue({}),
    excel: jest.fn(),
  };
  let controller: DepartedController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DepartedController],
      providers: [
        { provide: DepartedOverviewService, useValue: overviewService },
        { provide: DepartedListService, useValue: listService },
      ],
    }).compile();
    controller = module.get(DepartedController);
  });

  it('overview is gated by reports.students, like the old summary', () => {
    expect(routeAccess(DepartedController, 'overview')).toEqual({
      kind: 'can',
      keys: ['reports.students'],
    });
    expect(defaultRolesOf(DepartedController, 'overview')).toEqual(
      defaultRolesOf(ReportsController, 'getDepartedStudentsSummary'),
    );
  });

  it('list and excel are gated by reports.students with the same default roles as overview', () => {
    for (const route of ['list', 'excel'] as const) {
      expect(routeAccess(DepartedController, route)).toEqual({
        kind: 'can',
        keys: ['reports.students'],
      });
      expect(defaultRolesOf(DepartedController, route)).toEqual(
        defaultRolesOf(DepartedController, 'overview'),
      );
    }
  });

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    await controller.overview(q, 1001, [3, 7]);
    expect(overviewService.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('list passes the company, the resolved scope and the query', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31', page: 2 };
    await controller.list(q, 1001, [3, 7]);
    expect(listService.list).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('excel sends the workbook with its headers and file name', async () => {
    const buffer = Buffer.from('xlsx');
    listService.excel.mockResolvedValue({ buffer, filename: 'a.xlsx' });
    const res = { setHeader: jest.fn(), end: jest.fn() };
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    await controller.excel(q, 1001, null, res as never);
    expect(listService.excel).toHaveBeenCalledWith(1001, null, q);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="a.xlsx"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 4);
    expect(res.end).toHaveBeenCalledWith(buffer);
  });
});
