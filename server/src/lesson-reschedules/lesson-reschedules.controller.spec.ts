import { LessonReschedulesController } from './lesson-reschedules.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('LessonReschedulesController — route access', () => {
  describe('list()', () => {
    it('is gated by the group view capability', () => {
      expect(routeAccess(LessonReschedulesController, 'list')).toEqual({
        kind: 'can',
        keys: ['groups.view'],
      });
    });

    it('admits the three admin roles and the Teacher by default, not the Cashier', () => {
      expect(defaultRolesOf(LessonReschedulesController, 'list')).toEqual([
        ...ADMIN_ROLES,
        'Teacher',
      ]);
    });
  });

  describe.each(['availableRooms', 'create', 'update'])('%s()', (method) => {
    it('is gated by the lesson change capability', () => {
      expect(routeAccess(LessonReschedulesController, method)).toEqual({
        kind: 'can',
        keys: ['lessons.change'],
      });
    });

    it('admits the three admin roles by default — Teacher and Cashier excluded', () => {
      expect(defaultRolesOf(LessonReschedulesController, method)).toEqual(
        ADMIN_ROLES,
      );
    });
  });

  describe('remove()', () => {
    it('is gated by the lesson change delete capability', () => {
      expect(routeAccess(LessonReschedulesController, 'remove')).toEqual({
        kind: 'can',
        keys: ['lessons.change-delete'],
      });
    });

    it('admits the CEO and the Branch Director by default — Administrator excluded', () => {
      expect(defaultRolesOf(LessonReschedulesController, 'remove')).toEqual([
        'Branch Director',
        'CEO',
      ]);
    });
  });
});
