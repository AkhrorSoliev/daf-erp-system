import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { MonthCloseController } from './month-close.controller';

describe('MonthCloseController access', () => {
  it.each(['read', 'saveBankFees'] as const)(
    '%s needs settings.tax, CEO by default',
    (handler) => {
      expect(routeAccess(MonthCloseController, handler)).toEqual({
        kind: 'can',
        keys: ['settings.tax'],
      });
      expect(defaultRolesOf(MonthCloseController, handler)).toEqual(['CEO']);
    },
  );
});
