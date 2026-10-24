import { msg } from "@/i18n/msg";
import type { ReadinessKey } from "./launch-types";

/**
 * The journey map's stations — name, tour copy, and where the tour leads.
 *
 * `targets` — the `data-tour` value of the page's button (not a CSS class:
 * a class changes along with styling, the attribute exists only for this
 * purpose). When there are several, the first one found is highlighted.
 * `launch-targets.test.ts` checks that each one exists in the source.
 *
 * The texts are `msg()` markers: the card draws them with `t(…)`.
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
    short: msg("Ish vaqti"),
    action: msg("Ish vaqtini kiritish"),
    tourTitle: msg("Ish vaqti"),
    tourBody: msg(
      "Filial qaysi soatda ochilib yopilishini kiriting. Guruh jadvali shu oraliqda tuziladi.",
    ),
    route: (id) => `/settings/branches/${id}`,
    targets: ["branch-edit"],
  },
  {
    key: "room",
    short: msg("Xona"),
    action: msg("Xona qo'shish"),
    tourTitle: msg("Xona qo'shing"),
    tourBody: msg("Xonasiz guruh kunlik jadvalda ko'rinmaydi."),
    route: (id) => `/settings/rooms?branch=${id}`,
    targets: ["room-add"],
  },
  {
    key: "course",
    short: msg("Kurs"),
    action: msg("Kurs qo'shish"),
    tourTitle: msg("Kurs qo'shing"),
    tourBody: msg(
      "Nomi, narxi, to'lov modeli va necha darsga bo'linishi. Guruh ochish uchun kamida bitta kurs kerak.",
    ),
    route: () => "/settings/courses",
    targets: ["course-add"],
  },
  {
    key: "teachers",
    short: msg("Ustoz"),
    action: msg("Ustoz qo'shish"),
    tourTitle: msg("Ustozlarni qo'shing"),
    tourBody: msg(
      "Havolani ustozlarga yuboring — ular Telegram orqali o'zi ro'yxatdan o'tadi va shu filialga tushadi. Yoki qo'lda qo'shing.",
    ),
    route: () => "/teachers",
    targets: ["teacher-invite-link", "teacher-add"],
  },
  {
    key: "teacherRates",
    short: msg("Stavka"),
    action: msg("Stavka qo'yish"),
    tourTitle: msg("Stavka qo'ying"),
    tourBody: msg(
      "«Stavkalar» → «Ustoz stavkalari». Stavkasiz ustozni guruhga biriktirib bo'lmaydi.",
    ),
    route: () => "/payments/salary",
    targets: ["salary-settings"],
  },
  {
    key: "group",
    short: msg("Guruh"),
    action: msg("Guruh ochish"),
    tourTitle: msg("Guruh oching"),
    tourBody: msg("Kurs, xona, ustoz, dars kunlari va boshlanish sanasini kiriting."),
    route: () => "/groups",
    targets: ["group-add"],
  },
  {
    key: "enrollment",
    short: msg("O'quvchi"),
    action: msg("O'quvchi qo'shish"),
    tourTitle: msg("O'quvchi qo'shing"),
    tourBody: msg("O'quvchini qo'shing va guruhga yozing."),
    route: () => "/students",
    targets: ["student-add"],
  },
  {
    key: "payment",
    short: msg("To'lov"),
    action: msg("To'lov qayd qilish"),
    tourTitle: msg("Birinchi to'lov"),
    tourBody: msg(
      "Birinchi to'lovni qayd qiling — shundan keyin filial ishga tushgan hisoblanadi.",
    ),
    route: () => "/payments/overview",
    targets: ["payment-record"],
  },
];

/** Optional — does not count toward `launched`. */
export const LAUNCH_EXTRAS: LaunchStation[] = [
  {
    key: "administrator",
    short: msg("Administrator"),
    action: msg("Administrator qo'shish"),
    tourTitle: msg("Administrator qo'shing"),
    tourBody: msg("Administratorsiz davomat ogohlantirishlari hech kimga bormaydi."),
    route: () => "/settings/employees",
    targets: ["employee-add"],
  },
  {
    key: "leadSection",
    short: msg("Lid bo'limi"),
    action: msg("Lid bo'limi ochish"),
    tourTitle: msg("Lid bo'limi oching"),
    tourBody: msg("Lidlar va onlayn formalar shu bo'limga tushadi."),
    route: () => "/leads",
    targets: ["lead-section-add"],
  },
  {
    key: "telegramGroup",
    short: msg("Telegram guruh"),
    action: msg("Telegram guruhni ulash"),
    tourTitle: msg("Telegram hisobot guruhi"),
    tourBody: msg("Sahifadagi yo'riqnoma bo'yicha botni guruhga qo'shing va tasdiqlang."),
    route: () => "/settings/telegram-groups",
    // The page itself has a step-by-step guide — no button to highlight.
    targets: [],
  },
];
