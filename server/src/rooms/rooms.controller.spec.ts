import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('RoomsController — route access', () => {
  let controller: RoomsController;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
    countByBranch: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: mockService }],
    }).compile();

    controller = module.get(RoomsController);
  });

  describe.each([
    'create',
    'update',
    'changeStatus',
    'getStatusHistory',
    'delete',
  ])('%s()', (name) => {
    it('is gated by the reference lists capability', () => {
      expect(routeAccess(RoomsController, name)).toEqual({
        kind: 'can',
        keys: ['settings.reference'],
      });
    });

    it('admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(RoomsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  describe('getStatusHistory()', () => {
    // The service checks the room's branch against this caller and refuses
    // one it cannot identify, so a dropped id would 403 every request.
    it("passes the caller's id through for the branch check", async () => {
      await controller.getStatusHistory('room-1', 1001, 10011);
      expect(mockService.getStatusHistory).toHaveBeenCalledWith(
        'room-1',
        1001,
        10011,
      );
    });
  });

  // The room list feeds group forms and the occupancy view.
  describe.each(['findAll', 'findOne'])('%s()', (name) => {
    it('is staff-only — a student-portal token must not read it', () => {
      expect(routeAccess(RoomsController, name)).toEqual({ kind: 'anyStaff' });
      expect(defaultRolesOf(RoomsController, name)).not.toContain('Student');
    });
  });

  describe('countByBranch()', () => {
    it('is open to every signed-in account', () => {
      expect(routeAccess(RoomsController, 'countByBranch')).toEqual({
        kind: 'anyUser',
      });
    });
  });
});
