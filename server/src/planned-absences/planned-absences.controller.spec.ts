import { Test, TestingModule } from '@nestjs/testing';
import { PlannedAbsencesController } from './planned-absences.controller';
import { PlannedAbsencesService } from './planned-absences.service';
import { ACCESS_KEY } from '../common/permissions/access.decorators';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('PlannedAbsencesController — route access', () => {
  let controller: PlannedAbsencesController;

  const mockService = {
    upsert: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlannedAbsencesController],
      providers: [{ provide: PlannedAbsencesService, useValue: mockService }],
    }).compile();

    controller = module.get(PlannedAbsencesController);
  });

  // The marker sits on the class, so both routes inherit it.
  it('gates the pre-mark routes by the attendance fix capability at class level', () => {
    expect(Reflect.getMetadata(ACCESS_KEY, PlannedAbsencesController)).toEqual({
      kind: 'can',
      keys: ['attendance.fix'],
    });
  });

  it.each(['upsert', 'remove'])(
    '%s is gated by the attendance fix capability',
    (name) => {
      expect(routeAccess(PlannedAbsencesController, name)).toEqual({
        kind: 'can',
        keys: ['attendance.fix'],
      });
    },
  );

  it.each(['upsert', 'remove'])(
    '%s admits the three admin roles by default, not the Teacher or the Cashier',
    (name) => {
      expect(defaultRolesOf(PlannedAbsencesController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  describe('handler wiring', () => {
    it('upsert delegates to the service with params + user context', async () => {
      const dto = { studentId: 10001, kind: 'SABABSIZ' } as any;
      await controller.upsert('g1', '2026-06-10', dto, 99, 1, [
        'Administrator',
      ]);
      expect(mockService.upsert).toHaveBeenCalledWith(
        'g1',
        '2026-06-10',
        dto,
        99,
        ['Administrator'],
        1,
      );
    });

    it('remove delegates to the service with id + user context', async () => {
      await controller.remove('pa1', 99, 1, undefined as never);
      // `roles` is threaded through so the caller is checked against the
      // pre-mark's own group branch. `undefined` here is this test's absent
      // user context; the service treats a missing roles list as "not a pure
      // teacher" and takes the branch path, which is the safe default.
      expect(mockService.remove).toHaveBeenCalledWith('pa1', 99, 1, undefined);
    });
  });
});
