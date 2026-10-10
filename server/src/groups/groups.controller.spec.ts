import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('GroupsController — route access', () => {
  let controller: GroupsController;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    findStudentsByGroupId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
    getDeletePreview: jest.fn().mockResolvedValue({ active: 0, frozen: 0 }),
    getScheduleConflicts: jest.fn().mockResolvedValue([]),
    getAvailableRooms: jest.fn().mockResolvedValue([]),
    getAvailableTeachers: jest.fn().mockResolvedValue([]),
    getAvailableSlots: jest.fn().mockResolvedValue([]),
    getNextName: jest.fn().mockResolvedValue(''),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: mockService },
        {
          provide: GroupScheduleService,
          useValue: {
            getScheduleConflicts: jest.fn().mockResolvedValue([]),
            getAvailableRooms: jest.fn().mockResolvedValue([]),
            getAvailableTeachers: jest.fn().mockResolvedValue([]),
            getAvailableSlots: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get(GroupsController);
  });

  // Reads: the list, the detail and the roster. The service narrows a
  // Teacher to their own groups, so the route itself admits them.
  describe.each(['findAll', 'findOne', 'findStudentsByGroupId'])(
    '%s()',
    (method) => {
      it('is gated by the group view capability', () => {
        expect(routeAccess(GroupsController, method)).toEqual({
          kind: 'can',
          keys: ['groups.view'],
        });
      });

      it('admits the three admin roles and the Teacher by default, not the Cashier', () => {
        expect(defaultRolesOf(GroupsController, method)).toEqual([
          ...ADMIN_ROLES,
          'Teacher',
        ]);
      });
    },
  );

  // Group CRUD and its dialogs.
  describe.each([
    'create',
    'update',
    'changeStatus',
    'delete',
    'getDeletePreview',
    'getStatusHistory',
    'getNextName',
  ])('%s()', (method) => {
    it('is gated by the group management capability', () => {
      expect(routeAccess(GroupsController, method)).toEqual({
        kind: 'can',
        keys: ['groups.manage'],
      });
    });

    it('admits the three admin roles by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(GroupsController, method)).toEqual(ADMIN_ROLES);
    });
  });

  // The schedule helpers are also called by the lesson-change dialogs, so
  // either capability opens them (spec §7.4).
  describe.each([
    'getScheduleConflicts',
    'getAvailableRooms',
    'getAvailableTeachers',
    'getAvailableSlots',
  ])('%s()', (method) => {
    it('is gated by the group management or the lesson change capability', () => {
      expect(routeAccess(GroupsController, method)).toEqual({
        kind: 'can',
        keys: ['groups.manage', 'lessons.change'],
      });
    });

    it('admits the three admin roles by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(GroupsController, method)).toEqual(ADMIN_ROLES);
    });
  });

  describe('delete()', () => {
    it('hands the reason from the body to the service', async () => {
      await controller.delete(
        'group-1',
        { reason: "Guruh yig'ilmadi" },
        1,
        1001,
      );
      expect(mockService.delete).toHaveBeenCalledWith(
        'group-1',
        1,
        1001,
        "Guruh yig'ilmadi",
      );
    });
  });
});
