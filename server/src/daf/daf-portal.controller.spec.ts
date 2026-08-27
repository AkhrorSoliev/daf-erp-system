import { DafPortalController } from './daf-portal.controller';
import { RolesGuard } from '../common/guards';

/**
 * Guard bu yerda shart, garchi kontent maxfiy bo'lmasa ham.
 *
 * Global `JwtAuthGuard` faqat «kirgan» ekanini isbotlaydi — xodim portali
 * tokeni ham haqiqiy token. Urinish yozish esa o'quvchining natijasiga
 * tegadi, ya'ni kelajakdagi reytingga.
 */
describe('DafPortalController — ruxsat', () => {
  it('Student rolini talab qiladi', () => {
    expect(Reflect.getMetadata('roles', DafPortalController)).toEqual([
      'Student',
    ]);
  });

  it('RolesGuard bilan qo`riqlanadi', () => {
    const guards = Reflect.getMetadata('__guards__', DafPortalController) as
      | unknown[]
      | undefined;
    expect(guards).toContain(RolesGuard);
  });

  // Xodim rollari bu yerga tushmaydi: o'quv bo'limi o'quvchiniki, va
  // xodim nomidan urinish yozish natijani buzardi.
  it('xodim rollarini kiritmaydi', () => {
    const roles = Reflect.getMetadata('roles', DafPortalController) as string[];
    for (const staff of [
      'CEO',
      'Branch Director',
      'Administrator',
      'Teacher',
    ]) {
      expect(roles).not.toContain(staff);
    }
  });
});
