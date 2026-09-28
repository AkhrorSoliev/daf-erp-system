import { UserStatus } from '@prisma/client';
import {
  signInStaffWhere,
  staffLinkedToChatWhere,
  staffPortalFor,
} from './staff-telegram';

describe('staff-telegram (ADR-0045)', () => {
  describe('signInStaffWhere', () => {
    it("kira oladigan xodim: o'chirilmagan, bloklanmagan, xodim roli bor", () => {
      expect(signInStaffWhere()).toEqual({
        deletedAt: null,
        status: { in: [UserStatus.ACTIVE, UserStatus.INACTIVE] },
        roles: { some: { roleId: { in: [1, 2, 3, 4, 5] } } },
      });
    });

    it("o'quvchi rolini tashlab yuboradi: faqat o'quvchi so'ralsa hech kim mos kelmaydi", () => {
      expect(signInStaffWhere([4, 6]).roles).toEqual({
        some: { roleId: { in: [4] } },
      });
      expect(signInStaffWhere([6]).roles).toEqual({
        some: { roleId: { in: [] } },
      });
    });
  });

  it('staffLinkedToChatWhere — shu shart + chat', () => {
    expect(staffLinkedToChatWhere('700000001', [4])).toEqual({
      ...signInStaffWhere([4]),
      telegramChatId: '700000001',
    });
  });

  describe('staffPortalFor', () => {
    it.each([
      [[4], 'lehrer'],
      [[1], 'admin'],
      [[2], 'admin'],
      [[3], 'admin'],
      [[5], 'admin'],
      // Ustoz ham, administrator ham — admin portali ikkala rolni ko'rsatadi.
      [[3, 4], 'admin'],
      [[4, 5], 'admin'],
    ])('%j → %s', (roleIds, portal) => {
      expect(staffPortalFor(roleIds)).toBe(portal);
    });

    it("xodim roli yo'q hisob — portal yo'q", () => {
      expect(staffPortalFor([])).toBeNull();
      expect(staffPortalFor([6])).toBeNull();
    });
  });
});
