import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { TaxSettingsController } from './tax-settings.controller';

describe('TaxSettingsController access', () => {
  it.each(['get', 'update'] as const)(
    '%s needs settings.tax, CEO by default',
    (handler) => {
      expect(routeAccess(TaxSettingsController, handler)).toEqual({
        kind: 'can',
        keys: ['settings.tax'],
      });
      expect(defaultRolesOf(TaxSettingsController, handler)).toEqual(['CEO']);
    },
  );
});
