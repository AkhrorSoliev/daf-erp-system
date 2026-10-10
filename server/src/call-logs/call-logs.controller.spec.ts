import { Test, TestingModule } from '@nestjs/testing';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('CallLogsController', () => {
  let controller: CallLogsController;

  const mockService = {
    create: jest.fn().mockResolvedValue({ id: 'c1' }),
    list: jest.fn().mockResolvedValue({ total: 0, items: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallLogsController],
      providers: [{ provide: CallLogsService, useValue: mockService }],
    }).compile();

    controller = module.get(CallLogsController);
  });

  describe('route access', () => {
    it('logging a call result is gated by the call-log capability', () => {
      expect(routeAccess(CallLogsController, 'create')).toEqual({
        kind: 'can',
        keys: ['calls.log'],
      });
    });

    it('reading the call log is open to the outreach and the student details capabilities', () => {
      expect(routeAccess(CallLogsController, 'list')).toEqual({
        kind: 'can',
        keys: ['outreach.view', 'students.details'],
      });
    });

    it.each(['create', 'list'])(
      '%s admits the three admin roles by default, not the Teacher or the Cashier',
      (name) => {
        expect(defaultRolesOf(CallLogsController, name)).toEqual([
          'Administrator',
          'Branch Director',
          'CEO',
        ]);
      },
    );
  });

  describe('handler wiring', () => {
    it('create delegates with user context', async () => {
      const dto = {
        studentId: 10264,
        reason: 'ABSENCE',
        outcome: 'ANSWERED',
      } as any;
      await controller.create(dto, 10001, 1);
      expect(mockService.create).toHaveBeenCalledWith(dto, 10001, 1);
    });

    it('list delegates with user context, roles and query', async () => {
      const query = { page: 1, pageSize: 20 } as any;
      await controller.list(query, 10001, 1, ['Branch Director'], [2]);
      expect(mockService.list).toHaveBeenCalledWith({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [2],
        query,
      });
    });
  });
});
