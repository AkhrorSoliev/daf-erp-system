import { ForbiddenException } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { ROLE_ID } from '../common/auth/role-ids';
import {
  defaultRolesOf,
  fakePermissions,
  routeAccess,
} from '../common/permissions/testing';

describe('CoursesController — route access', () => {
  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
  };

  // `roleIds` are the roles the caller holds in the database; the
  // capabilities they carry come from the catalog defaults.
  const controllerFor = (roleIds: number[]) =>
    new CoursesController(
      mockService as unknown as CoursesService,
      fakePermissions(roleIds),
    );

  beforeEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('is gated by the course creation capability', () => {
      expect(routeAccess(CoursesController, 'create')).toEqual({
        kind: 'can',
        keys: ['courses.create'],
      });
    });

    it('admits the CEO and the Branch Director by default, nobody else', () => {
      expect(defaultRolesOf(CoursesController, 'create')).toEqual([
        'Branch Director',
        'CEO',
      ]);
    });
  });

  describe.each(['update', 'changeStatus', 'getStatusHistory', 'delete'])(
    '%s()',
    (name) => {
      it('is gated by the reference lists capability', () => {
        expect(routeAccess(CoursesController, name)).toEqual({
          kind: 'can',
          keys: ['settings.reference'],
        });
      });

      it('admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier', () => {
        expect(defaultRolesOf(CoursesController, name)).toEqual([
          'Administrator',
          'Branch Director',
          'CEO',
        ]);
      });
    },
  );

  describe('update()', () => {
    // The route marker lets the Administrator through the endpoint for
    // ordinary field edits (name, price...) — but paymentModel is a money
    // decision (it moves every group on the course onto different billing
    // rules), and course CREATE already gates that with `courses.create`. The
    // marker can't express "this endpoint, except this one field", so
    // `update()` checks it by hand — these tests call the controller METHOD
    // directly, not just read the marker.
    describe('paymentModel field-level restriction', () => {
      it('rejects an Administrator changing paymentModel, even though the marker admits them', async () => {
        await expect(
          controllerFor([ROLE_ID.ADMINISTRATOR]).update(
            'course-1',
            { paymentModel: 'MONTHLY' } as any,
            10,
            1,
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(mockService.update).not.toHaveBeenCalled();
      });

      it('allows CEO to change paymentModel', async () => {
        await controllerFor([ROLE_ID.CEO]).update(
          'course-1',
          { paymentModel: 'MONTHLY' } as any,
          10,
          1,
        );
        expect(mockService.update).toHaveBeenCalledWith(
          'course-1',
          { paymentModel: 'MONTHLY' },
          10,
          1,
        );
      });

      it('allows Branch Director to change paymentModel', async () => {
        await controllerFor([ROLE_ID.BRANCH_DIRECTOR]).update(
          'course-1',
          { paymentModel: 'LESSON_PACK' } as any,
          10,
          1,
        );
        expect(mockService.update).toHaveBeenCalled();
      });

      it('allows Administrator to update other fields (no paymentModel in the body)', async () => {
        await controllerFor([ROLE_ID.ADMINISTRATOR]).update(
          'course-1',
          { name: 'Yangi nom' } as any,
          10,
          1,
        );
        expect(mockService.update).toHaveBeenCalledWith(
          'course-1',
          { name: 'Yangi nom' },
          10,
          1,
        );
      });
    });
  });

  describe('getStatusHistory()', () => {
    // The service checks the course's branch against this caller and refuses
    // one it cannot identify, so a dropped id would 403 every request.
    it("passes the caller's id through for the branch check", async () => {
      await controllerFor([ROLE_ID.CEO]).getStatusHistory(
        'course-1',
        1001,
        10011,
      );
      expect(mockService.getStatusHistory).toHaveBeenCalledWith(
        'course-1',
        1001,
        10011,
      );
    });
  });

  // The course list feeds group forms and price lookups.
  describe.each(['findAll', 'findOne'])('%s()', (name) => {
    it('is staff-only — a student-portal token must not read it', () => {
      expect(routeAccess(CoursesController, name)).toEqual({
        kind: 'anyStaff',
      });
      expect(defaultRolesOf(CoursesController, name)).not.toContain('Student');
    });
  });
});
