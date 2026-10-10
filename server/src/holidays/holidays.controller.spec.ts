import { Test, TestingModule } from '@nestjs/testing';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('HolidaysController — route access', () => {
  let controller: HolidaysController;

  const mockService = {
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 }),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HolidaysController],
      providers: [{ provide: HolidaysService, useValue: mockService }],
    }).compile();

    controller = module.get(HolidaysController);
  });

  describe.each([
    'create',
    'update',
    'remove',
    'changeStatus',
    'getStatusHistory',
  ])('%s()', (name) => {
    it('is gated by the reference lists capability', () => {
      expect(routeAccess(HolidaysController, name)).toEqual({
        kind: 'can',
        keys: ['settings.reference'],
      });
    });

    it('admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(HolidaysController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  // These two used to assert the guard was ABSENT, which encoded the hole as if
  // it were the contract — the same shape four other controller specs carried
  // before Batch 7. They assert a marker that excludes the student portal, so
  // the test fails if the route is ever opened to it again.
  describe.each(['findAll', 'findOne'])('%s() — staff only', (name) => {
    it('carries the any-staff marker, which excludes Student', () => {
      expect(routeAccess(HolidaysController, name)).toEqual({
        kind: 'anyStaff',
      });
      expect(defaultRolesOf(HolidaysController, name)).not.toContain('Student');
    });

    it('admits every staff role', () => {
      expect(defaultRolesOf(HolidaysController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
        'Cashier',
        'Teacher',
      ]);
    });
  });

  // `findAll` was given a role guard and a companyId; `findOne` was left with
  // neither, so any valid token — a student-portal one included — could read
  // any holiday in the database by id. The comment above `findAll` said both
  // had been fixed.
  describe('findOne()', () => {
    it('passes the caller company through to the service', () => {
      controller.findOne('h-1', 1001);
      expect(mockService.findOne).toHaveBeenCalledWith('h-1', 1001);
    });
  });
});
