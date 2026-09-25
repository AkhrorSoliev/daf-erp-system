import type { ReadinessKey } from "./launch-types";

/**
 * The journey map's stations — name, tour copy, and where the tour leads.
 *
 * `targets` — the `data-tour` value of the page's button (not a CSS class:
 * a class changes along with styling, the attribute exists only for this
 * purpose). When there are several, the first one found is highlighted.
 * `launch-targets.test.ts` checks that each one exists in the source.
 */
export interface LaunchStation {
  key: ReadinessKey;
  /** Short name on the map. */
  short: string;
  /** Button text — a verb. */
  action: string;
  tourTitle: string;
  tourBody: string;
  route: (branchId: number) => string;
  targets: string[];
}

export const LAUNCH_STATIONS: LaunchStation[] = [
  {
    key: "workingHours",
    short: "Ish vaqti",
    action: "Ish vaqtini kiritish",
    tourTitle: "Ish vaqti",
    tourBody:
      "Filial qaysi soatda ochilib yopilishini kiriting. Guruh jadvali shu oraliqda tuziladi.",
    route: (id) => `/settings/branches/${id}`,
    targets: ["branch-edit"],
  },
  {
    key: "room",
    short: "Xona",
    action: "Xona qo'shish",
    tourTitle: "Xona qo'shing",
    tourBody: "Xonasiz guruh kunlik jadvalda ko'rinmaydi.",
    route: (id) => `/settings/rooms?branch=${id}`,
    targets: ["room-add"],
  },
  {
    key: "course",
    short: "Kurs",
    action: "Kurs qo'shish",
    tourTitle: "Kurs qo'shing",
    tourBody:
      "Nomi, narxi, to'lov modeli va necha darsga bo'linishi. Guruh ochish uchun kamida bitta kurs kerak.",
    route: () => "/settings/courses",
    targets: ["course-add"],
  },
  {
    key: "teachers",
    short: "Ustoz",
    action: "Ustoz qo'shish",
    tourTitle: "Ustozlarni qo'shing",
    tourBody:
      "Havolani ustozlarga yuboring — ular Telegram orqali o'zi ro'yxatdan o'tadi va shu filialga tushadi. Yoki qo'lda qo'shing.",
    route: () => "/teachers",
    targets: ["teacher-invite-link", "teacher-add"],
  },
  {
    key: "teacherRates",
    short: "Stavka",
    action: "Stavka qo'yish",
    tourTitle: "Stavka qo'ying",
    tourBody:
      "«Sozlamalar» → «Ustoz stavkalari». Stavkasiz ustozni guruhga biriktirib bo'lmaydi.",
    route: () => "/payments/salary",
    targets: ["salary-settings"],
  },
  {
    key: "group",
    short: "Guruh",
    action: "Guruh ochish",
    tourTitle: "Guruh oching",
    tourBody: "Kurs, xona, ustoz, dars kunlari va boshlanish sanasini kiriting.",
    route: () => "/groups",
    targets: ["group-add"],
  },
  {
    key: "enrollment",
    short: "O'quvchi",
    action: "O'quvchi qo'shish",
    tourTitle: "O'quvchi qo'shing",
    tourBody: "O'quvchini qo'shing va guruhga yozing.",
    route: () => "/students",
    targets: ["student-add"],
  },
  {
    key: "payment",
    short: "To'lov",
    action: "To'lov qayd qilish",
    tourTitle: "Birinchi to'lov",
    tourBody:
      "Birinchi to'lovni qayd qiling — shundan keyin filial ishga tushgan hisoblanadi.",
    route: () => "/payments/overview",
    targets: ["payment-record"],
  },
];

/** Optional — does not count toward `launched`. */
export const LAUNCH_EXTRAS: LaunchStation[] = [
  {
    key: "administrator",
    short: "Administrator",
    action: "Administrator qo'shish",
    tourTitle: "Administrator qo'shing",
    tourBody: "Administratorsiz davomat ogohlantirishlari hech kimga bormaydi.",
    route: () => "/settings/employees",
    targets: ["employee-add"],
  },
  {
    key: "leadSection",
    short: "Lid bo'limi",
    action: "Lid bo'limi ochish",
    tourTitle: "Lid bo'limi oching",
    tourBody: "Lidlar va onlayn formalar shu bo'limga tushadi.",
    route: () => "/leads",
    targets: ["lead-section-add"],
  },
  {
    key: "telegramGroup",
    short: "Telegram guruh",
    action: "Telegram guruhni ulash",
    tourTitle: "Telegram hisobot guruhi",
    tourBody: "Sahifadagi yo'riqnoma bo'yicha botni guruhga qo'shing va tasdiqlang.",
    route: () => "/settings/telegram-groups",
    // The page itself has a step-by-step guide — no button to highlight.
    targets: [],
  },
];
