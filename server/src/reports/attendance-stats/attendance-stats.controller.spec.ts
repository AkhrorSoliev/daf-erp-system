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
  };
  let controller: AttendanceStatsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttendanceStatsController],
      providers: [{ provide: AttendanceStatsService, useValue: service }],
    }).compile();
    controller = module.get(AttendanceStatsController);
  });

  it.each(['overview', 'missers'])(
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
});
