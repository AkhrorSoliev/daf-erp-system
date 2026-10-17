import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { AttendanceStatsController } from './attendance-stats.controller';
import { AttendanceStatsService } from './attendance-stats.service';

describe('AttendanceStatsController', () => {
  const service = {
    overview: jest.fn().mockResolvedValue({}),
    missers: jest
      .fn()
      .mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 }),
    excel: jest.fn().mockResolvedValue({
      buffer: Buffer.from('xlsx'),
      filename: 'davomat-2026-09-01_2026-09-30.xlsx',
    }),
  };
  let controller: AttendanceStatsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttendanceStatsController],
      providers: [{ provide: AttendanceStatsService, useValue: service }],
    }).compile();
    controller = module.get(AttendanceStatsController);
  });

  it.each(['overview', 'missers', 'excel'])(
    '%s is gated by reports.students and admits CEO and Branch Director only',
    (method) => {
      expect(routeAccess(AttendanceStatsController, method)).toEqual({
        kind: 'can',
        keys: ['reports.students'],
      });
      expect(defaultRolesOf(AttendanceStatsController, method)).toEqual([
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      cut: 'teacher' as const,
    };
    await controller.overview(q, 1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('missers passes the row key through', async () => {
    const q = {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      cut: 'group' as const,
      key: 'g1',
    };
    await controller.missers(q, 1001, null);
    expect(service.missers).toHaveBeenCalledWith(1001, null, q);
  });

  it('excel sends the workbook as an attachment with the three headers', async () => {
    const q = { startDate: '2026-09-01', endDate: '2026-09-30' };
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel(q, 1001, [4], res as never);
    expect(service.excel).toHaveBeenCalledWith(1001, [4], q);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="davomat-2026-09-01_2026-09-30.xlsx"',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 4);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
});
