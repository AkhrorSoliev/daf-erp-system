import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlannedAbsencesController } from './planned-absences.controller';
import { PlannedAbsencesService } from './planned-absences.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('PlannedAbsencesController — role guards', () => {
  let controller: PlannedAbsencesController;
  let reflector: Reflector;
  let guard: RolesGuard;

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
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(roles: string[]) {
    return {
      getHandler: () => () => null,
      getClass: () => PlannedAbsencesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  it('restricts the controller to CEO, Branch Director, Administrator', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, PlannedAbsencesController);
    expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
  });

  it.each(['CEO', 'Branch Director', 'Administrator'])('allows %s', (role) => {
    expect(guard.canActivate(mockExecutionContext([role]))).toBe(true);
  });

  it.each(['Teacher', 'Cashier'])('denies %s', (role) => {
    expect(() => guard.canActivate(mockExecutionContext([role]))).toThrow(
      ForbiddenException,
    );
  });

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
