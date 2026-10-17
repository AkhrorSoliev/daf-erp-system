import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { ReportsController } from '../reports.controller';
import { DepartedController } from './departed.controller';
import { DepartedOverviewService } from './departed-overview.service';

describe('DepartedController', () => {
  const service = { overview: jest.fn().mockResolvedValue({}) };
  let controller: DepartedController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DepartedController],
      providers: [{ provide: DepartedOverviewService, useValue: service }],
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

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = { startDate: '2026-10-01', endDate: '2026-10-31' };
    await controller.overview(q, 1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });
});
