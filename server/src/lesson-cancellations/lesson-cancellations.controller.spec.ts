import { LessonCancellationsController } from './lesson-cancellations.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

const ADMIN_ROLES = ['Administrator', 'Branch Director', 'CEO'];

describe('LessonCancellationsController — route access', () => {
  describe.each(['create', 'reschedule'])('%s()', (method) => {
    it('is gated by the lesson change capability', () => {
      expect(routeAccess(LessonCancellationsController, method)).toEqual({
        kind: 'can',
        keys: ['lessons.change'],
      });
    });

    it('admits the three admin roles by default — Teacher and Cashier excluded', () => {
      expect(defaultRolesOf(LessonCancellationsController, method)).toEqual(
        ADMIN_ROLES,
      );
    });
  });

  describe('remove()', () => {
    it('is gated by the lesson change delete capability', () => {
      expect(routeAccess(LessonCancellationsController, 'remove')).toEqual({
        kind: 'can',
        keys: ['lessons.change-delete'],
      });
    });

    it('admits the CEO and the Branch Director by default — Administrator excluded', () => {
      expect(defaultRolesOf(LessonCancellationsController, 'remove')).toEqual([
        'Branch Director',
        'CEO',
      ]);
    });
  });
});
