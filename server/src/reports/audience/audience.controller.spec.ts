import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { AudienceController } from './audience.controller';
import { AudienceService } from './audience.service';

describe('AudienceController', () => {
  const service = { overview: jest.fn().mockResolvedValue({}) };
  let controller: AudienceController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [AudienceController],
      providers: [{ provide: AudienceService, useValue: service }],
    }).compile();
    controller = m.get(AudienceController);
  });

  it('overview is gated by reports.students and admits CEO and Branch Director only', () => {
    expect(routeAccess(AudienceController, 'overview')).toEqual({
      kind: 'can',
      keys: ['reports.students'],
    });
    expect(defaultRolesOf(AudienceController, 'overview')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('passes the company and the resolved scope', async () => {
    await controller.overview(1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7]);
  });
});
