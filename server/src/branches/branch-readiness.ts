/**
 * Branch-launch readiness check — the PURE half.
 *
 * `BranchesService.getReadiness` (via `gatherReadinessFacts`) gathers the raw
 * facts from the database; this file turns them into the checklist. Split out
 * because deciding what counts as "done" — the client's roadmap and when the
 * launch card disappears — is a product decision that should be testable
 * without mocking Prisma.
 */

export type ReadinessKey =
  | 'cashAccount'
  | 'bankAccount'
  | 'workingHours'
  | 'room'
  | 'course'
  | 'teachers'
  | 'teacherRates'
  | 'group'
  | 'enrollment'
  | 'payment'
  | 'administrator'
  | 'leadSection'
  | 'telegramGroup';

export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** `false` — "extra": counts toward neither `ready` nor `launched`. */
  required: boolean;
  /** Changes with the state — spells out exactly what is still missing. */
  hint: string;
  /** `ceoOnly` set only when true — a Branch Director cannot rate this one (ADR-0034). */
  details?: { id: number; name: string; ceoOnly?: boolean }[];
}

export interface BranchReadiness {
  branchId: number;
  branchName: string;
  /** Every REQUIRED check passes. */
  ready: boolean;
  /** The branch is operating: a runnable group + an enrolled student + a payment. */
  launched: boolean;
  checks: ReadinessCheck[];
}

export interface ReadinessFacts {
  branchId: number;
  branchName: string;
  hasCash: boolean;
  hasBank: boolean;
  hasWorkingHours: boolean;
  roomCount: number;
  courseCount: number;
  adminCount: number;
  /** `ceoOnly` — also holds CEO or Branch Director, so only the CEO may rate them (ADR-0034). */
  teachers: { id: number; name: string; hasRate: boolean; ceoOnly: boolean }[];
  groupCount: number;
  /** A group with a teacher, scheduled days, a start time AND a start date. */
  hasRunnableGroup: boolean;
  hasStudent: boolean;
  hasEnrollment: boolean;
  hasPayment: boolean;
  hasLeadSection: boolean;
  hasTelegramGroup: boolean;
}

export function buildBranchReadiness(f: ReadinessFacts): BranchReadiness {
  const hasTeachers = f.teachers.length > 0;
  // Named, not "some teacher" — the UI should say exactly who still needs a rate.
  const withoutRate = f.teachers
    .filter((t) => !t.hasRate)
    .map((t) => ({
      id: t.id,
      name: t.name,
      ...(t.ceoOnly ? { ceoOnly: true } : {}),
    }));

  const checks: ReadinessCheck[] = [
    {
      key: 'cashAccount',
      label: 'Naqd kassa',
      ok: f.hasCash,
      required: true,
      hint: "Filialga faol CASH kassasi kerak — busiz naqd to'lov qabul qilinmaydi",
    },
    {
      key: 'bankAccount',
      label: 'Bank hisobi',
      ok: f.hasBank,
      required: true,
      hint: 'Bank/karta tushumi uchun faol BANK hisobi kerak',
    },
    {
      key: 'workingHours',
      label: 'Ish vaqti',
      ok: f.hasWorkingHours,
      required: true,
      hint: 'Ish vaqti belgilanmasa jadval 08:00–20:00 ga tushadi',
    },
    {
      key: 'room',
      label: 'Xona',
      ok: f.roomCount > 0,
      required: true,
      hint: 'Xonasiz guruh kunlik jadvalda chizilmaydi',
    },
    {
      key: 'course',
      label: 'Kurs',
      ok: f.courseCount > 0,
      required: true,
      hint: "Kurssiz guruh ochib bo'lmaydi",
    },
    {
      key: 'teachers',
      label: 'Ustoz',
      ok: hasTeachers,
      required: true,
      hint: "Ustozlarni Telegram havola orqali yoki qo'lda qo'shing",
    },
    {
      key: 'teacherRates',
      label: 'Ustoz stavkalari',
      // No teachers is not "everyone has a rate" — there is nobody to check.
      // An empty list used to make this `ok` for exactly that reason.
      ok: hasTeachers && withoutRate.length === 0,
      required: true,
      hint: !hasTeachers
        ? "Avval ustoz qo'shing"
        : withoutRate.length > 0
          ? `${withoutRate.length} ta ustozga stavka qo'yilmagan`
          : "Stavkasiz ustozning darslari uchun oylik YOZILMAYDI va keyin orqaga surib bo'lmaydi",
      details: withoutRate,
    },
    {
      key: 'group',
      label: 'Guruh',
      ok: f.hasRunnableGroup,
      required: true,
      hint: f.hasRunnableGroup
        ? 'Ustozi va jadvali bor guruh ochilgan'
        : f.groupCount === 0
          ? 'Kurs, ustoz va jadval bilan birinchi guruhni oching'
          : 'Guruh bor, lekin ustoz, dars kunlari yoki boshlanish sanasi kiritilmagan',
    },
    {
      key: 'enrollment',
      label: "O'quvchi",
      ok: f.hasEnrollment,
      required: true,
      hint: f.hasEnrollment
        ? "O'quvchilar guruhga yozilgan"
        : f.hasStudent
          ? "O'quvchilar bor, lekin hech biri guruhga yozilmagan"
          : "O'quvchi qo'shib, guruhga yozing",
    },
    {
      key: 'payment',
      label: "To'lov",
      ok: f.hasPayment,
      required: true,
      hint: f.hasPayment
        ? "Birinchi to'lov qayd qilingan"
        : "Birinchi to'lovni qayd qiling",
    },
    {
      key: 'administrator',
      label: 'Administrator',
      ok: f.adminCount > 0,
      required: false,
      hint: 'Administratorsiz davomat ogohlantirishlari hech kimga bormaydi',
    },
    {
      key: 'leadSection',
      label: "Lid bo'limi",
      ok: f.hasLeadSection,
      required: false,
      hint: "Lidlar va onlayn formalar uchun kamida bitta bo'lim kerak",
    },
    {
      key: 'telegramGroup',
      label: 'Telegram guruh',
      ok: f.hasTelegramGroup,
      required: false,
      hint: 'Kunlik hisobot Telegram guruhga borishi uchun guruhni ulang',
    },
  ];

  return {
    branchId: f.branchId,
    branchName: f.branchName,
    ready: checks.every((c) => !c.required || c.ok),
    // Checks 1-5 are launch PREP; only these three prove the branch is
    // actually OPERATING (spec Q4).
    launched: f.hasRunnableGroup && f.hasEnrollment && f.hasPayment,
    checks,
  };
}
