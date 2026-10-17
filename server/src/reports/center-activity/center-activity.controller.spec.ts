import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { CenterActivityController } from './center-activity.controller';
import { CenterActivityService } from './center-activity.service';

describe('CenterActivityController', () => {
  const service = { overview: jest.fn().mockResolvedValue({}) };
  let controller: CenterActivityController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CenterActivityController],
      providers: [{ provide: CenterActivityService, useValue: service }],
    }).compile();
    controller = module.get(CenterActivityController);
  });

  it('overview is gated by reports.students and admits CEO and Branch Director only', () => {
    expect(routeAccess(CenterActivityController, 'overview')).toEqual({
      kind: 'can',
      keys: ['reports.students'],
    });
    expect(defaultRolesOf(CenterActivityController, 'overview')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = { oy: '2026-09', filial: 2 };
    await controller.overview(q, 1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });
});
