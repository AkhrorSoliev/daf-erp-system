import { AbsencePauseController } from './absence-pause.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('AbsencePauseController — rollar', () => {
  it("o'qish CEO va Branch Director uchun ochiq", () => {
    expect(routeAccess(AbsencePauseController, 'get')).toEqual({
      kind: 'can',
      keys: ['settings.absence-pause'],
    });
    expect(defaultRolesOf(AbsencePauseController, 'get')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('yozish faqat CEO uchun — sozlama butun kompaniyaga taalluqli', () => {
    expect(routeAccess(AbsencePauseController, 'update')).toEqual({
      kind: 'can',
      keys: ['settings.company'],
    });
    expect(defaultRolesOf(AbsencePauseController, 'update')).toEqual(['CEO']);
  });

  it('Student hech qayerga kira olmaydi', () => {
    for (const name of ['get', 'update']) {
      expect(defaultRolesOf(AbsencePauseController, name)).not.toContain(
        'Student',
      );
    }
  });
});
