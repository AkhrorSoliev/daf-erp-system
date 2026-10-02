import { describe, expect, it } from "vitest";
import {
  CALL_LOG_ROLES,
  COMPANY_EDIT_ROLES,
  FROZEN_BALANCE_ACTION_ROLES,
  GROUP_PAGE_ROLES,
  STUDENT_PROFILE_ROLES,
  hasAnyRole,
} from "./role-access";

/**
 * Har bir holat — ekran va server kelishishi shart bo'lgan joy: ekran ko'rsatib
 * server rad etsa, foydalanuvchi 403 oladi; server ruxsat berib ekran
 * yashirsa, kerakli ish qilinmay qoladi. Server tomoni o'sha controller'ning
 * spec faylida.
 */

const CEO = 1;
const BRANCH_DIRECTOR = 2;
const ADMINISTRATOR = 3;
const TEACHER = 4;
const CASHIER = 5;

const roles = (...ids: number[]) => ids.map((id) => ({ id }));

describe("hasAnyRole", () => {
  it("bitta mos rol yetadi, rollar tartibi muhim emas", () => {
    // Kassir birinchi turadi: faqat birinchi rolga qaraydigan xato shu yerda
    // `false` qaytaradi.
    expect(hasAnyRole(roles(CASHIER, TEACHER), GROUP_PAGE_ROLES)).toBe(true);
  });

  it("foydalanuvchi hali yuklanmagan yoki rolsiz — ruxsat yo'q", () => {
    expect(hasAnyRole(undefined, GROUP_PAGE_ROLES)).toBe(false);
    expect(hasAnyRole([], GROUP_PAGE_ROLES)).toBe(false);
  });
});

describe("guruh sahifasi — GET /groups/:id (groups.controller.ts)", () => {
  it("kassir ocholmaydi", () => {
    expect(hasAnyRole(roles(CASHIER), GROUP_PAGE_ROLES)).toBe(false);
  });

  it.each([CEO, BRANCH_DIRECTOR, ADMINISTRATOR, TEACHER])(
    "%i-rol ochadi",
    (id) => {
      expect(hasAnyRole(roles(id), GROUP_PAGE_ROLES)).toBe(true);
    },
  );
});

describe("o'quvchi profili — GET /students/:id (students.controller.ts)", () => {
  it("faqat o'qituvchi ocholmaydi", () => {
    expect(hasAnyRole(roles(TEACHER), STUDENT_PROFILE_ROLES)).toBe(false);
  });

  it("o'qituvchi kassir ham bo'lsa — ochadi (kassir roli yetadi)", () => {
    expect(hasAnyRole(roles(TEACHER, CASHIER), STUDENT_PROFILE_ROLES)).toBe(
      true,
    );
  });

  it.each([CEO, BRANCH_DIRECTOR, ADMINISTRATOR, CASHIER])(
    "%i-rol ochadi",
    (id) => {
      expect(hasAnyRole(roles(id), STUDENT_PROFILE_ROLES)).toBe(true);
    },
  );
});

describe("kompaniya ma'lumotlarini saqlash — PATCH /company/:id (company.controller.ts)", () => {
  it("faqat CEO", () => {
    expect(hasAnyRole(roles(CEO), COMPANY_EDIT_ROLES)).toBe(true);
    expect(hasAnyRole(roles(BRANCH_DIRECTOR), COMPANY_EDIT_ROLES)).toBe(false);
    expect(hasAnyRole(roles(ADMINISTRATOR), COMPANY_EDIT_ROLES)).toBe(false);
  });
});

describe("qarzdorlik sahifasining amallari (/payments/debt)", () => {
  it("«Natijani kiritish» — POST /call-logs: kassirga yo'q", () => {
    expect(hasAnyRole(roles(CASHIER), CALL_LOG_ROLES)).toBe(false);
    expect(hasAnyRole(roles(ADMINISTRATOR), CALL_LOG_ROLES)).toBe(true);
  });

  it("«Muzlatilgan puli» amallari — POST /withdrawals, POST /refunds/quick: kassirga yo'q", () => {
    expect(hasAnyRole(roles(CASHIER), FROZEN_BALANCE_ACTION_ROLES)).toBe(
      false,
    );
    expect(hasAnyRole(roles(ADMINISTRATOR), FROZEN_BALANCE_ACTION_ROLES)).toBe(
      true,
    );
  });
});
