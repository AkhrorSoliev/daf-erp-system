import { routeAccess } from '../common/permissions/testing';
import { LessonRatingsController } from './lesson-ratings.controller';

describe('LessonRatingsController access', () => {
  it.each(['summary', 'teacher', 'low', 'setEnabled'])(
    '%s is CEO-only by identity',
    (name) => {
      expect(routeAccess(LessonRatingsController, name)).toEqual({
        kind: 'ceo',
      });
    },
  );
});
