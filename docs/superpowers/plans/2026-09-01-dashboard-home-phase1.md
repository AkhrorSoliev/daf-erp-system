# Bosh sahifa boshqaruv paneli — Faza 1 (frontend, fixture ma'lumot)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` sahifasini rolga qarab boshqaruv paneli qilib ko'rsatish — butun joylashuv va rol mantiqi tayyor, raqamlar hozircha fixture faylidan olinadi.

**Architecture:** Rol mantiqi va ro'yxat filtri **sof funksiyalarga** ajratiladi (`dashboard-home-visibility.ts`) — chunki loyihaning vitest sozlamasi `environment: "node"`, jsdom va testing-library yo'q, ya'ni **komponent render testlari yozib bo'lmaydi**. Ko'rinish komponentlari ma'lumotni faqat `props` orqali oladi; manba bitta joyda (`home-overview.tsx`) turadi, shuning uchun Faza 2 da fixture'ni `useQuery` ga almashtirish uchun bitta fayl o'zgaradi.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind + shadcn/ui, zustand (`useAuth`, `useBranchSwitcher`), TanStack Query, vitest (node muhiti).

## Global Constraints

- **Til:** butun UI matni **lotin alifbosidagi o'zbekcha**. Kirill yoki arab harflari ishlatilmaydi.
- **Rol raqamlari:** `1=CEO, 2=Filial direktori, 3=Administrator, 4=O'qituvchi, 5=Kassir`.
- **Rol ko'rinishi:** pul bloklari faqat 1 va 2 ga; outreach qatorlari 1, 2, 3 ga; qolgan bloklar 1, 2, 3, 5 ga; faqat-4-rol o'qituvchi jadvalni ko'radi.
- **Yangi «yig'im foizi» kiritilmaydi.** Tizimda uning yagona ta'rifi bor.
- **Kartalar ustida ayirish/bo'lish qilinmaydi** — «Oy oxiriga kutilyapti» (darslar qiymati) va «Bu oy tushum» (kassa) turli bazada.
- **Faza 1 da backendga umuman tegilmaydi.** `server/` ostidagi birorta fayl o'zgarmaydi.
- **`0` bo'lgan «e'tibor» qatori chizilmaydi.** Hammasi bo'sh bo'lsa bitta ijobiy xabar chiqadi.
- **Son formatlash:** faqat `@/lib/format-utils` dagi `formatNumber` / `formatBalance` / `formatPercent`. Yangi formatter yozilmaydi.
- **Test buyrug'i:** `cd client && npx vitest run <fayl>`.
- **Shox:** `feat/dashboard-home-redesign` (allaqachon yaratilgan).

**Spec:** [docs/superpowers/specs/2026-09-01-dashboard-home-redesign-design.md](../specs/2026-09-01-dashboard-home-redesign-design.md)

---

## Fayl tuzilishi

| Fayl | Mas'uliyati |
|---|---|
| `client/src/components/dashboard/dashboard-summary-types.ts` | `/dashboard/summary` javob tiplari. Faza 2 da o'zgarmaydi |
| `client/src/components/dashboard/dashboard-home-visibility.ts` | Sof funksiyalar: rol → bloklar, `0` qatorlarni filtrlash, keyingi darslarni tanlash |
| `client/src/components/dashboard/dashboard-home-visibility.test.ts` | O'sha sof funksiyalar testi |
| `client/src/components/dashboard/home-fixture.ts` | Soxta ma'lumot. **Faza 2 da o'chiriladi** |
| `client/src/components/dashboard/home-money-cards.tsx` | 4 ta pul kartasi |
| `client/src/components/dashboard/home-people-stats.tsx` | 4 ta odam sanagichi |
| `client/src/components/dashboard/home-attention-list.tsx` | «E'tibor talab qiladi» ro'yxati |
| `client/src/components/dashboard/home-next-lessons.tsx` | Keyingi 5 dars |
| `client/src/components/dashboard/home-skeleton.tsx` | Yuklanish holati |
| `client/src/components/dashboard/home-overview.tsx` | Bloklarni yig'adi, **yagona ma'lumot manbai** |
| `client/src/components/dashboard/schedule-client.tsx` | Hozirgi `dashboard-client.tsx` mazmuni ko'chiriladi |
| `client/src/app/(dashboard)/schedule/page.tsx` | `/schedule` route |
| `client/src/components/dashboard-client.tsx` | Jadval `git mv` bilan chiqib ketgach shu yo'lda qaytadan yaratiladi: rol yo'naltirgichi |
| `client/src/lib/nav-items.ts` | **Tahrir:** «Jadval» bandi |
| `client/src/lib/breadcrumb-routes.ts` | **Tahrir:** `schedule: "Jadval"` |

---

### Task 1: Tiplar va rol/ko'rinish mantiqi

**Files:**
- Create: `client/src/components/dashboard/dashboard-summary-types.ts`
- Create: `client/src/components/dashboard/dashboard-home-visibility.ts`
- Test: `client/src/components/dashboard/dashboard-home-visibility.test.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi task)
- Produces:
  - Tiplar: `DashboardMoney`, `DashboardPeople`, `DashboardTopDebtor`, `DashboardAttention`, `DashboardNextLesson`, `DashboardSummary`
  - `isTeacherOnly(roleIds: number[]): boolean`
  - `resolveHomeSections(roleIds: number[]): HomeSections` — `{ money, people, attention, attentionOutreachRows, nextLessons }`, hammasi `boolean`
  - `visibleAttentionRows(attention: DashboardAttention, opts: { includeOutreach: boolean }): AttentionRow[]`
  - `pickNextLessons(lessons: DashboardNextLesson[], now: string, limit?: number): DashboardNextLesson[]`

- [ ] **Step 1: Tiplar faylini yaratish**

`client/src/components/dashboard/dashboard-summary-types.ts`:

```ts
/**
 * `GET /dashboard/summary` javobining shakli.
 *
 * Faza 1 da bu tiplarni `home-fixture.ts` to'ldiradi, Faza 2 da esa haqiqiy
 * so'rov. Shuning uchun bu fayl ikkala fazada ham o'zgarmaydi — ko'rinish
 * komponentlari faqat shu tiplarga tayanadi.
 */

/** Faqat CEO (1) va filial direktori (2) uchun. Boshqa rollarda `null`. */
export interface DashboardMoney {
  /** Shu oy kassaga tushgan pul. */
  monthIncome: number;
  /** Shu oydagi to'lovlar soni — «Bu oy tushum» kartasining ost-satri. */
  paymentCount: number;
  /**
   * Oy oxirigi prognoz — o'tilgan va rejadagi darslar qiymati.
   * `monthIncome` bilan BOSHQA bazada: ikkovi ayirilmaydi.
   */
  expectedMonthEnd: number;
  netProfit: number;
  /**
   * `'cash'` — kanonik sof foyda hisoblanmadi va bu eski kassa raqami.
   * Bunda karta o'zini «Foyda (kassa asosida)» deb ataydi, chunki kassa
   * raqami sof foydadan ancha yuqori chiqadi.
   */
  netProfitBasis: "recognized" | "cash";
  debt: { total: number; count: number };
}

/** Rol 1, 2, 3, 5 uchun. */
export interface DashboardPeople {
  activeStudents: number;
  newThisMonth: number;
  /** Shu oy chiqarilgan + guruhdan tushib qolgan. */
  leftThisMonth: number;
  activeGroups: number;
  /** Shu oyning o'rtacha davomati, 0–100. */
  attendancePct: number;
  todayLessons: number;
}

export interface DashboardTopDebtor {
  id: number;
  name: string;
  /** Har doim manfiy — qarz. */
  balance: number;
}

/**
 * Rol 1, 2, 3 uchun to'liq. Kassir (5) da faqat `topDebtors` to'ladi,
 * qolgan uch son `0` bo'ladi — outreach endpointlari unga ochiq emas.
 */
export interface DashboardAttention {
  todayAbsentees: number;
  brokenPromises: number;
  removalQueue: number;
  topDebtors: DashboardTopDebtor[];
}

export interface DashboardNextLesson {
  groupId: string;
  groupName: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  teacherName: string | null;
  roomName: string | null;
  studentCount: number;
}

export interface DashboardSummary {
  money: DashboardMoney | null;
  people: DashboardPeople | null;
  attention: DashboardAttention | null;
  /** Filial tanlanmagan («Barcha filiallar») holatda `null`. */
  nextLessons: DashboardNextLesson[] | null;
  /** Yiqilgan bo'limlar nomi, masalan `["money"]`. */
  failed: string[];
}
```

- [ ] **Step 2: Yiqiladigan testni yozish**

`client/src/components/dashboard/dashboard-home-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isTeacherOnly,
  pickNextLessons,
  resolveHomeSections,
  visibleAttentionRows,
} from "./dashboard-home-visibility";
import type {
  DashboardAttention,
  DashboardNextLesson,
} from "./dashboard-summary-types";

describe("isTeacherOnly", () => {
  it("faqat o'qituvchi roli bo'lsa true", () => {
    expect(isTeacherOnly([4])).toBe(true);
  });

  it("o'qituvchi ayni paytda administrator bo'lsa false", () => {
    expect(isTeacherOnly([3, 4])).toBe(false);
  });

  it("CEO ham o'qituvchi bo'lsa false", () => {
    expect(isTeacherOnly([1, 4])).toBe(false);
  });

  it("rol ro'yxati bo'sh bo'lsa false", () => {
    expect(isTeacherOnly([])).toBe(false);
  });
});

describe("resolveHomeSections", () => {
  it("CEO hamma blokni ko'radi", () => {
    expect(resolveHomeSections([1])).toEqual({
      money: true,
      people: true,
      attention: true,
      attentionOutreachRows: true,
      nextLessons: true,
    });
  });

  it("filial direktori ham hamma blokni ko'radi", () => {
    expect(resolveHomeSections([2]).money).toBe(true);
  });

  it("administrator pul bloklarini ko'rmaydi", () => {
    const s = resolveHomeSections([3]);
    expect(s.money).toBe(false);
    expect(s.people).toBe(true);
    expect(s.attentionOutreachRows).toBe(true);
  });

  it("kassir pulni ham outreach qatorlarini ham ko'rmaydi", () => {
    const s = resolveHomeSections([5]);
    expect(s.money).toBe(false);
    expect(s.attentionOutreachRows).toBe(false);
    expect(s.attention).toBe(true);
    expect(s.people).toBe(true);
  });
});

const attention: DashboardAttention = {
  todayAbsentees: 3,
  brokenPromises: 0,
  removalQueue: 2,
  topDebtors: [],
};

describe("visibleAttentionRows", () => {
  it("soni nol bo'lgan qatorni tashlab ketadi", () => {
    const rows = visibleAttentionRows(attention, { includeOutreach: true });
    expect(rows.map((r) => r.key)).toEqual(["absentees", "removalQueue"]);
  });

  it("hammasi nol bo'lsa bo'sh massiv qaytaradi", () => {
    const rows = visibleAttentionRows(
      { todayAbsentees: 0, brokenPromises: 0, removalQueue: 0, topDebtors: [] },
      { includeOutreach: true },
    );
    expect(rows).toEqual([]);
  });

  it("outreach ruxsati yo'q bo'lsa bitta ham qator chiqmaydi", () => {
    const rows = visibleAttentionRows(attention, { includeOutreach: false });
    expect(rows).toEqual([]);
  });
});

const lessons: DashboardNextLesson[] = [
  { groupId: "a", groupName: "A1-1", startTime: "09:00", endTime: "10:30", teacherName: "Aziz", roomName: "101", studentCount: 12 },
  { groupId: "b", groupName: "A2-3", startTime: "14:00", endTime: "15:30", teacherName: "Dilnoza", roomName: "102", studentCount: 9 },
  { groupId: "c", groupName: "B1-2", startTime: "16:00", endTime: "17:30", teacherName: null, roomName: null, studentCount: 7 },
];

describe("pickNextLessons", () => {
  it("tugagan darsni tashlab, qolganini vaqt bo'yicha qaytaradi", () => {
    const next = pickNextLessons(lessons, "11:00");
    expect(next.map((l) => l.groupId)).toEqual(["b", "c"]);
  });

  it("davom etayotgan darsni qoldiradi", () => {
    const next = pickNextLessons(lessons, "14:30");
    expect(next[0].groupId).toBe("b");
  });

  it("limitdan ortiqchasini kesadi", () => {
    expect(pickNextLessons(lessons, "00:00", 2)).toHaveLength(2);
  });

  it("kun tugagan bo'lsa bo'sh massiv", () => {
    expect(pickNextLessons(lessons, "23:00")).toEqual([]);
  });

  it("tartibsiz kelgan ro'yxatni ham vaqt bo'yicha saralaydi", () => {
    const shuffled = [lessons[2], lessons[0], lessons[1]];
    expect(pickNextLessons(shuffled, "00:00").map((l) => l.groupId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilishini ko'rish**

Run: `cd client && npx vitest run src/components/dashboard/dashboard-home-visibility.test.ts`
Expected: FAIL — `Failed to resolve import "./dashboard-home-visibility"`

- [ ] **Step 4: Mantiqni yozish**

`client/src/components/dashboard/dashboard-home-visibility.ts`:

```ts
import type {
  DashboardAttention,
  DashboardNextLesson,
} from "./dashboard-summary-types";

/**
 * Bosh sahifaning rol mantiqi — ATAYLAB komponentlardan ajratilgan.
 *
 * Loyihaning vitest sozlamasi `environment: "node"` (jsdom ham,
 * testing-library ham yo'q), ya'ni render testi yozib bo'lmaydi. Kim nimani
 * ko'rishi — moliyaviy ma'lumot ko'rsatilishini hal qiladigan qaror, u
 * sinovsiz qolmasligi kerak. Shuning uchun u shu yerda, sof funksiya sifatida.
 */

export const ROLE_CEO = 1;
export const ROLE_BRANCH_DIRECTOR = 2;
export const ROLE_ADMIN = 3;
export const ROLE_TEACHER = 4;
export const ROLE_CASHIER = 5;

export interface HomeSections {
  /** 4 ta pul kartasi. */
  money: boolean;
  /** 4 ta odam sanagichi. */
  people: boolean;
  /** «E'tibor talab qiladi» bloki umuman chiziladimi. */
  attention: boolean;
  /** Blok ichidagi outreach qatorlari (kelmaganlar, va'dalar, navbat). */
  attentionOutreachRows: boolean;
  /** Keyingi darslar bloki. */
  nextLessons: boolean;
}

/**
 * «Faqat o'qituvchi» — 1/2/3 rollaridan birortasi ham yo'q foydalanuvchi.
 * Bunday odam `/` da boshqaruv paneli emas, jadvalni ko'radi.
 */
export function isTeacherOnly(roleIds: number[]): boolean {
  if (!roleIds.includes(ROLE_TEACHER)) return false;
  return !roleIds.some(
    (id) => id === ROLE_CEO || id === ROLE_BRANCH_DIRECTOR || id === ROLE_ADMIN,
  );
}

export function resolveHomeSections(roleIds: number[]): HomeSections {
  const has = (id: number) => roleIds.includes(id);
  const money = has(ROLE_CEO) || has(ROLE_BRANCH_DIRECTOR);
  const outreach = money || has(ROLE_ADMIN);
  const staff = outreach || has(ROLE_CASHIER);
  return {
    money,
    people: staff,
    attention: staff,
    attentionOutreachRows: outreach,
    nextLessons: staff,
  };
}

export interface AttentionRow {
  key: "absentees" | "brokenPromises" | "removalQueue";
  label: string;
  count: number;
  href: string;
  /** Qanchalik shoshilinch — rangni shu belgilaydi. */
  tone: "danger" | "warning";
}

/**
 * Soni `0` bo'lgan qator umuman qaytarilmaydi: bosh sahifa nollar bilan
 * to'ldirilmaydi, ro'yxatda faqat bugun haqiqatan bajarish kerak bo'lgan ish
 * turadi.
 */
export function visibleAttentionRows(
  attention: DashboardAttention,
  opts: { includeOutreach: boolean },
): AttentionRow[] {
  if (!opts.includeOutreach) return [];
  const rows: AttentionRow[] = [
    {
      key: "absentees",
      label: "Bugun darsga kelmadi",
      count: attention.todayAbsentees,
      href: "/outreach",
      tone: "danger",
    },
    {
      key: "brokenPromises",
      label: "Muddati o'tgan to'lov va'dasi",
      count: attention.brokenPromises,
      href: "/outreach",
      tone: "danger",
    },
    {
      key: "removalQueue",
      label: "Ketma-ket 3 marta kelmadi",
      count: attention.removalQueue,
      href: "/outreach",
      tone: "warning",
    },
  ];
  return rows.filter((r) => r.count > 0);
}

/** "HH:mm" ni kun boshidan hisoblangan daqiqaga aylantiradi. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Hozirgi vaqtdan keyin tugaydigan darslar — davom etayotgani ham kiradi,
 * chunki u hali «o'tib ketmagan». Kirish ro'yxati saralanmagan bo'lishi
 * mumkin, shuning uchun bu yerda o'zi saralaydi.
 */
export function pickNextLessons(
  lessons: DashboardNextLesson[],
  now: string,
  limit = 5,
): DashboardNextLesson[] {
  const nowMin = timeToMinutes(now);
  return [...lessons]
    .filter((l) => timeToMinutes(l.endTime) > nowMin)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    .slice(0, limit);
}
```

- [ ] **Step 5: Testni qayta ishga tushirish**

Run: `cd client && npx vitest run src/components/dashboard/dashboard-home-visibility.test.ts`
Expected: PASS — 16 ta test.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/dashboard/dashboard-summary-types.ts \
        client/src/components/dashboard/dashboard-home-visibility.ts \
        client/src/components/dashboard/dashboard-home-visibility.test.ts
git commit -m "Bosh sahifa: javob tiplari va rol/ko'rinish mantiqi"
```

---

### Task 2: Jadvalni /schedule ga ko'chirish, rol yo'naltirgich, pul va odam bloklari

Bu taskdan keyin `/` **localhostda ko'rinadigan** bo'ladi.

**Files:**
- Create: `client/src/components/dashboard/schedule-client.tsx`
- Create: `client/src/app/(dashboard)/schedule/page.tsx`
- Create: `client/src/components/dashboard/home-fixture.ts`
- Create: `client/src/components/dashboard/home-money-cards.tsx`
- Create: `client/src/components/dashboard/home-people-stats.tsx`
- Create: `client/src/components/dashboard/home-overview.tsx`
- Create: `client/src/components/dashboard-client.tsx` — Step 1 dagi `git mv` bu yo'lni bo'shatib ketadi, shuning uchun u qaytadan yaratiladi
- Modify: `client/src/lib/nav-items.ts`
- Modify: `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: Task 1 dagi `DashboardSummary`, `isTeacherOnly`, `resolveHomeSections`
- Produces:
  - `ScheduleClient()` — hozirgi jadval sahifasi, `@/components/dashboard/schedule-client` dan
  - `HOME_FIXTURE: DashboardSummary` — `@/components/dashboard/home-fixture` dan
  - `HomeMoneyCards({ money }: { money: DashboardMoney })`
  - `HomePeopleStats({ people }: { people: DashboardPeople })`
  - `HomeOverview()`

- [ ] **Step 1: Jadval komponentini ko'chirish**

```bash
git mv client/src/components/dashboard-client.tsx \
       client/src/components/dashboard/schedule-client.tsx
```

Keyin `schedule-client.tsx` ichida uchta o'zgarish:

1. Komponent nomi: `export function DashboardClient()` → `export function ScheduleClient()`
2. Nisbiy importlar bir daraja qisqaradi:
```ts
// eski:
import { DashboardDailySchedule } from "./dashboard/dashboard-daily-schedule";
import type { DashboardLesson } from "./dashboard/dashboard-daily-schedule";
import { DashboardRoomOccupancy } from "./dashboard/dashboard-room-occupancy";
import { DashboardScheduleSkeleton } from "./dashboard/dashboard-schedule-skeleton";
// yangi:
import { DashboardDailySchedule } from "./dashboard-daily-schedule";
import type { DashboardLesson } from "./dashboard-daily-schedule";
import { DashboardRoomOccupancy } from "./dashboard-room-occupancy";
import { DashboardScheduleSkeleton } from "./dashboard-schedule-skeleton";
```
3. Fayl boshidagi izohga bir qator qo'shiladi:
```ts
/**
 * Kunlik dars jadvali — `/schedule` sahifasining butun mazmuni.
 *
 * Ilgari bu bosh sahifaning O'ZI edi. Bosh sahifa boshqaruv paneliga
 * aylangach jadval shu yerga ko'chdi; `/` da uni faqat «faqat o'qituvchi»
 * roli ko'radi, chunki o'qituvchiga aynan shu kerak.
 */
```

- [ ] **Step 2: `/schedule` route yaratish**

`client/src/app/(dashboard)/schedule/page.tsx`:

```tsx
import { Suspense } from "react";
import { ScheduleClient } from "@/components/dashboard/schedule-client";

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleClient />
    </Suspense>
  );
}
```

`Suspense` shart: `ScheduleClient` `useSearchParams()` ishlatadi, usiz Next.js build'da xato beradi.

- [ ] **Step 3: Menyu va breadcrumb**

`client/src/lib/nav-items.ts` — `CalendarDays` ni `lucide-react` importiga qo'shing va «Bosh sahifa» dan keyin bitta band:

```ts
export const navItems: NavItem[] = [
  { title: "Bosh sahifa", url: "/", icon: LayoutDashboard },
  // Kunlik jadval ilgari bosh sahifaning o'zi edi. Bosh sahifa boshqaruv
  // paneliga aylangach u alohida sahifaga chiqdi — hamma rol ko'radi.
  { title: "Jadval", url: "/schedule", icon: CalendarDays },
  { title: "O'qituvchilar", url: "/teachers", icon: GraduationCap, visibleForRoles: [1, 2, 3] },
  // ...qolgani o'zgarishsiz
];
```

`client/src/lib/breadcrumb-routes.ts` — `routeLabels` ichiga:

```ts
  schedule: "Jadval",
```

- [ ] **Step 4: Fixture faylini yozish**

`client/src/components/dashboard/home-fixture.ts`:

```ts
import type { DashboardSummary } from "./dashboard-summary-types";

/**
 * FAZA 1 UCHUN SOXTA MA'LUMOT — joylashuvni localhostda ko'rish uchun.
 *
 * Faza 2 da `GET /dashboard/summary` yozilgach BU FAYL O'CHIRILADI va
 * `home-overview.tsx` uni `useQuery` ga almashtiradi. Boshqa hech qayerda
 * import qilinmasin.
 *
 * Raqamlar o'ylab topilgan; haqiqiy bazadan olinmagan.
 */
export const HOME_FIXTURE: DashboardSummary = {
  money: {
    monthIncome: 128_450_000,
    paymentCount: 214,
    expectedMonthEnd: 176_200_000,
    netProfit: 18_930_000,
    netProfitBasis: "recognized",
    debt: { total: 27_748_684, count: 177 },
  },
  people: {
    activeStudents: 842,
    newThisMonth: 63,
    leftThisMonth: 19,
    activeGroups: 47,
    attendancePct: 88,
    todayLessons: 34,
  },
  attention: {
    todayAbsentees: 12,
    brokenPromises: 5,
    removalQueue: 3,
    topDebtors: [
      { id: 10061, name: "Sardor Nazarov", balance: -1_240_000 },
      { id: 10284, name: "Malika Yo'ldosheva", balance: -980_000 },
      { id: 10453, name: "Jasur Rahimov", balance: -845_000 },
      { id: 10655, name: "Nilufar Qodirova", balance: -720_000 },
      { id: 10338, name: "Bekzod Ismoilov", balance: -615_000 },
    ],
  },
  nextLessons: [
    { groupId: "g1", groupName: "A1-07", startTime: "09:00", endTime: "10:30", teacherName: "Aziza Karimova", roomName: "101-xona", studentCount: 14 },
    { groupId: "g2", groupName: "A2-03", startTime: "10:40", endTime: "12:10", teacherName: "Otabek Yusupov", roomName: "102-xona", studentCount: 11 },
    { groupId: "g3", groupName: "B1-02", startTime: "14:00", endTime: "15:30", teacherName: "Dilnoza Ergasheva", roomName: "203-xona", studentCount: 9 },
    { groupId: "g4", groupName: "A1-11", startTime: "16:00", endTime: "17:30", teacherName: "Aziza Karimova", roomName: "101-xona", studentCount: 15 },
    { groupId: "g5", groupName: "B2-01", startTime: "17:40", endTime: "19:10", teacherName: null, roomName: "205-xona", studentCount: 8 },
  ],
  failed: [],
};
```

- [ ] **Step 5: Pul kartalarini yozish**

`client/src/components/dashboard/home-money-cards.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Banknote, TrendingUp, UserMinus, Wallet } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { DashboardMoney } from "./dashboard-summary-types";

interface MoneyCardProps {
  icon: typeof Wallet;
  label: string;
  value: number;
  hint: string;
  tooltip: string;
  href: string;
  valueClassName?: string;
}

function MoneyCard({
  icon: Icon,
  label,
  value,
  hint,
  tooltip,
  href,
  valueClassName,
}: MoneyCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="flex flex-col rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <div
            className={cn(
              "mt-3 text-xl font-semibold tabular-nums sm:text-2xl",
              valueClassName,
            )}
          >
            {formatNumber(value)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function HomeMoneyCards({ money }: { money: DashboardMoney }) {
  // Kanonik sof foyda hisoblanmagan bo'lsa raqam kassa asosida keladi va
  // haqiqiy foydadan ancha yuqori chiqadi — karta buni YASHIRMAYDI, o'z
  // sarlavhasini almashtiradi.
  const profitIsCash = money.netProfitBasis === "cash";

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <MoneyCard
        icon={Wallet}
        label="Bu oy tushum"
        value={money.monthIncome}
        hint={`${formatNumber(money.paymentCount)} ta to'lov`}
        tooltip="Shu oy kassaga tushgan pul (so'm)."
        href="/payments/overview"
      />
      <MoneyCard
        icon={TrendingUp}
        label="Oy oxiriga kutilyapti"
        value={money.expectedMonthEnd}
        hint="prognoz"
        tooltip="Oy oxirigi prognoz: o'tilgan va rejadagi darslar qiymati. Bu kassa tushumi emas — ikkovi turli o'lchov, shuning uchun ular ayirilmaydi."
        href="/payments/overview"
      />
      <MoneyCard
        icon={UserMinus}
        label="Qarzdorlik"
        value={money.debt.total}
        hint={`${formatNumber(money.debt.count)} ta qarzdor`}
        tooltip="Markazga qarzdor o'quvchilarning jami qarzi (so'm)."
        href="/payments/debt"
        valueClassName={money.debt.total > 0 ? "text-red-600" : undefined}
      />
      <MoneyCard
        icon={Banknote}
        label={profitIsCash ? "Foyda (kassa asosida)" : "Sof foyda"}
        value={money.netProfit}
        hint={profitIsCash ? "kassa asosida" : "shu oy"}
        tooltip={
          profitIsCash
            ? "Kanonik sof foyda hisoblanmadi, bu kassa asosidagi raqam: ustoz oyligi keyingi davrda to'lanadi, shuning uchun bu son haqiqiy foydadan yuqori chiqadi."
            : "Shu oyning sof foydasi: dars tushumidan ustoz va admin oyligi, operatsion xarajat va qaytarishlar ayirilgan."
        }
        href="/payments/overview"
        valueClassName={money.netProfit < 0 ? "text-red-600" : "text-emerald-600"}
      />
    </div>
  );
}
```

- [ ] **Step 6: Odam sanagichlarini yozish**

`client/src/components/dashboard/home-people-stats.tsx`:

```tsx
"use client";

import Link from "next/link";
import { CalendarCheck, CalendarDays, Users, UsersRound } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import type { DashboardPeople } from "./dashboard-summary-types";

interface PeopleStatProps {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
  href: string;
}

function PeopleStat({ icon: Icon, label, value, hint, href }: PeopleStatProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:bg-accent/40 sm:gap-3 sm:p-3"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold tabular-nums sm:text-lg">
          {value}
          {hint && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {hint}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

export function HomePeopleStats({ people }: { people: DashboardPeople }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <PeopleStat
        icon={Users}
        label="Aktiv o'quvchilar"
        value={formatNumber(people.activeStudents)}
        hint={`+${people.newThisMonth} / −${people.leftThisMonth}`}
        href="/students"
      />
      <PeopleStat
        icon={UsersRound}
        label="Aktiv guruhlar"
        value={formatNumber(people.activeGroups)}
        href="/groups"
      />
      <PeopleStat
        icon={CalendarCheck}
        label="Bu oy davomat"
        value={formatPercent(people.attendancePct)}
        href="/reports/attendance"
      />
      <PeopleStat
        icon={CalendarDays}
        label="Bugungi darslar"
        value={formatNumber(people.todayLessons)}
        href="/schedule"
      />
    </div>
  );
}
```

- [ ] **Step 7: HomeOverview ni yozish (hozircha ikki blok)**

`client/src/components/dashboard/home-overview.tsx`:

```tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { resolveHomeSections } from "./dashboard-home-visibility";
import { HOME_FIXTURE } from "./home-fixture";
import { HomeMoneyCards } from "./home-money-cards";
import { HomePeopleStats } from "./home-people-stats";

/**
 * Bosh sahifadagi boshqaruv paneli.
 *
 * BU FAYL — ma'lumotning YAGONA manbai. Faza 1 da u `HOME_FIXTURE` dan
 * keladi; Faza 2 da shu yerdagi bitta qator `useQuery("/dashboard/summary")`
 * ga almashadi va quyidagi bloklarning birortasi ham o'zgarmaydi.
 */
export function HomeOverview() {
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const sections = resolveHomeSections(roleIds);

  // FAZA 1: soxta ma'lumot. Faza 2 da almashadi.
  const data = HOME_FIXTURE;

  return (
    <div className="space-y-4 sm:space-y-6">
      {sections.money && data.money && <HomeMoneyCards money={data.money} />}
      {sections.people && data.people && (
        <HomePeopleStats people={data.people} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: `dashboard-client.tsx` ni rol yo'naltirgichi sifatida qayta yaratish**

Step 1 dagi `git mv` bu faylni `dashboard/schedule-client.tsx` ga olib ketdi, ya'ni yo'l hozir bo'sh. Shu yo'lda yangi fayl yarating — `app/(dashboard)/page.tsx` uni o'zgarishsiz import qilaveradi:

`client/src/components/dashboard-client.tsx`:

```tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { isTeacherOnly } from "@/components/dashboard/dashboard-home-visibility";
import { HomeOverview } from "@/components/dashboard/home-overview";
import { ScheduleClient } from "@/components/dashboard/schedule-client";
import { HomeSkeleton } from "@/components/dashboard/home-skeleton";

/**
 * `/` sahifasining yo'naltirgichi — o'zi hech narsa chizmaydi.
 *
 * «Faqat o'qituvchi» rolidagi odam bu yerda jadvalni ko'radi, chunki unga
 * aynan shu kerak; qolgan xodimlar boshqaruv panelini ko'radi. Redirect
 * ATAYLAB ishlatilmagan: `/` manzili o'zgarmasa, xatcho'p ham, orqaga qaytish
 * ham buzilmaydi.
 */
export function DashboardClient() {
  const user = useAuth((s) => s.user);

  // Foydalanuvchi hali hydrate bo'lmagan: rol ro'yxati bo'sh bo'lgani uchun
  // noto'g'ri blok chizilib, keyin sakrab almashmasin.
  if (!user) return <HomeSkeleton />;

  const roleIds = user.roles.map((r) => r.id);
  if (isTeacherOnly(roleIds)) return <ScheduleClient />;
  return <HomeOverview />;
}
```

- [ ] **Step 9: Vaqtinchalik skeleton yozish**

`client/src/components/dashboard/home-skeleton.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[60px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <Skeleton className="h-64 rounded-xl lg:col-span-3" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Tip tekshiruvi va testlar**

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz (0 error).

Run: `cd client && npx vitest run`
Expected: barcha testlar PASS.

- [ ] **Step 11: Localhostda ko'rish**

Run: `cd client && npm run dev`
Brauzerda `/` ni oching (CEO akkaunt bilan): yuqorida 4 ta pul kartasi, ostida 4 ta sanagich chiqishi kerak. `/schedule` ni oching: eski jadval sahifasi to'liq ishlashi kerak. Chap menyuda «Jadval» bandi turgan bo'lsin.

- [ ] **Step 12: Commit**

```bash
git add client/src/components/dashboard client/src/components/dashboard-client.tsx \
        client/src/app/\(dashboard\)/schedule client/src/lib/nav-items.ts \
        client/src/lib/breadcrumb-routes.ts
git commit -m "Bosh sahifa: jadval /schedule ga ko'chdi, pul va odam bloklari qo'shildi"
```

---

### Task 3: «E'tibor talab qiladi» bloki

**Files:**
- Create: `client/src/components/dashboard/home-attention-list.tsx`
- Modify: `client/src/components/dashboard/home-overview.tsx`

**Interfaces:**
- Consumes: Task 1 dagi `visibleAttentionRows`, `DashboardAttention`; Task 2 dagi `HomeOverview`
- Produces: `HomeAttentionList({ attention, includeOutreach }: { attention: DashboardAttention; includeOutreach: boolean })`

- [ ] **Step 1: Blokni yozish**

`client/src/components/dashboard/home-attention-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { visibleAttentionRows } from "./dashboard-home-visibility";
import type { DashboardAttention } from "./dashboard-summary-types";

interface Props {
  attention: DashboardAttention;
  /** Outreach qatorlari (kelmaganlar, va'dalar, navbat) ko'rsatiladimi. */
  includeOutreach: boolean;
}

export function HomeAttentionList({ attention, includeOutreach }: Props) {
  const rows = visibleAttentionRows(attention, { includeOutreach });
  const debtors = attention.topDebtors;
  const isEmpty = rows.length === 0 && debtors.length === 0;

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <CircleAlert className="size-4 text-muted-foreground" />
        <h2 className="font-heading text-sm font-semibold">
          E&apos;tibor talab qiladi
        </h2>
      </header>

      {isEmpty ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-emerald-600" />
          Bugun e&apos;tibor talab qiladigan narsa yo&apos;q
        </div>
      ) : (
        <div className="divide-y">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  row.tone === "danger" ? "bg-red-500" : "bg-orange-500",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.label}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  row.tone === "danger" ? "text-red-600" : "text-orange-600",
                )}
              >
                {formatNumber(row.count)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}

          {debtors.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Eng katta qarzdorlar
                </p>
                <Link
                  href="/payments/debt"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Hammasi
                </Link>
              </div>
              {debtors.map((d) => (
                <Link
                  key={d.id}
                  href={`/students/${d.id}`}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {d.name}
                  </span>
                  <span className="text-sm font-medium tabular-nums text-red-600">
                    {formatBalance(d.balance)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `HomeOverview` ga ulash**

`home-overview.tsx` ichida `HomePeopleStats` blokidan keyin:

```tsx
      {sections.attention && data.attention && (
        <HomeAttentionList
          attention={data.attention}
          includeOutreach={sections.attentionOutreachRows}
        />
      )}
```

va yuqoriga import:

```tsx
import { HomeAttentionList } from "./home-attention-list";
```

- [ ] **Step 3: Bo'sh holatni qo'lda tekshirish**

`home-fixture.ts` da vaqtincha `attention` ni butunlay bo'shatib ko'ring:

```ts
  attention: { todayAbsentees: 0, brokenPromises: 0, removalQueue: 0, topDebtors: [] },
```

Brauzerda `/` — «Bugun e'tibor talab qiladigan narsa yo'q» xabari chiqishi kerak, nollar bilan to'ldirilgan qatorlar EMAS. Keyin fixture'ni asl holiga qaytaring.

- [ ] **Step 4: Tip tekshiruvi**

Run: `cd client && npx tsc --noEmit`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/dashboard/home-attention-list.tsx \
        client/src/components/dashboard/home-overview.tsx
git commit -m "Bosh sahifa: «E'tibor talab qiladi» bloki"
```

---

### Task 4: «Keyingi darslar» bloki va ikki ustunli joylashuv

**Files:**
- Create: `client/src/components/dashboard/home-next-lessons.tsx`
- Modify: `client/src/components/dashboard/home-overview.tsx`

**Interfaces:**
- Consumes: Task 1 dagi `pickNextLessons`, `DashboardNextLesson`; Task 3 dagi `HomeAttentionList`
- Produces: `HomeNextLessons({ lessons }: { lessons: DashboardNextLesson[] | null })`

- [ ] **Step 1: Blokni yozish**

`client/src/components/dashboard/home-next-lessons.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, DoorOpen, Users } from "lucide-react";
import { pickNextLessons } from "./dashboard-home-visibility";
import type { DashboardNextLesson } from "./dashboard-summary-types";

/** "HH:mm" ko'rinishidagi hozirgi mahalliy vaqt. */
function nowHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function HomeNextLessons({
  lessons,
}: {
  lessons: DashboardNextLesson[] | null;
}) {
  // Vaqt faqat mijozda ma'lum. Serverda va birinchi renderda `null` — shu
  // sababli SSR va mijoz mos keladi, hidration ogohlantirishi chiqmaydi.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    setNow(nowHhMm());
    const id = setInterval(() => setNow(nowHhMm()), 60_000);
    return () => clearInterval(id);
  }, []);

  const next = lessons && now ? pickNextLessons(lessons, now) : [];

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-sm font-semibold">
          <CalendarDays className="size-4 text-muted-foreground" />
          Keyingi darslar
        </h2>
        <Link
          href="/schedule"
          className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          To&apos;liq jadval
          <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {lessons === null ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Jadval bitta filialning xonalari va ish vaqti bo&apos;yicha chiziladi,
          shuning uchun &laquo;Barcha filiallar&raquo; ko&apos;rinishida
          ko&apos;rsatilmaydi. Yuqoridagi almashtirgichdan filialni tanlang.
        </p>
      ) : now === null ? (
        <div className="px-4 py-8" />
      ) : next.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          Bugungi darslar tugadi.
        </p>
      ) : (
        <ul className="divide-y">
          {next.map((l) => (
            <li key={l.groupId}>
              <Link
                href={`/groups/${l.groupId}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <span className="w-11 shrink-0 text-sm font-semibold tabular-nums">
                  {l.startTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {l.groupName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.teacherName ?? "O'qituvchi belgilanmagan"}
                  </span>
                </span>
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <DoorOpen className="size-3.5" />
                  {l.roomName ?? "—"}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {l.studentCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `HomeOverview` da ikki ustunli joylashuv**

`home-overview.tsx` ning `return` qismini shunga almashtiring:

```tsx
  return (
    <div className="space-y-4 sm:space-y-6">
      {sections.money && data.money && <HomeMoneyCards money={data.money} />}
      {sections.people && data.people && (
        <HomePeopleStats people={data.people} />
      )}

      {/* Chapda bugun qilinadigan ish, o'ngda bugun bo'ladigan dars. Mobilda
          biri ikkinchisining ostiga tushadi — «e'tibor» birinchi bo'ladi,
          chunki u harakat talab qiladi. */}
      <div className="grid gap-3 lg:grid-cols-5 lg:gap-4">
        {sections.attention && data.attention && (
          <div className="lg:col-span-3">
            <HomeAttentionList
              attention={data.attention}
              includeOutreach={sections.attentionOutreachRows}
            />
          </div>
        )}
        {sections.nextLessons && (
          <div className="lg:col-span-2">
            <HomeNextLessons lessons={data.nextLessons} />
          </div>
        )}
      </div>
    </div>
  );
```

va importga:

```tsx
import { HomeNextLessons } from "./home-next-lessons";
```

- [ ] **Step 3: «Barcha filiallar» holatini qo'lda tekshirish**

`home-fixture.ts` da vaqtincha `nextLessons: null` qiling. Brauzerda `/` — o'ng blokda filial tanlash haqidagi izoh chiqishi kerak, bo'sh ro'yxat emas. Keyin asl holiga qaytaring.

- [ ] **Step 4: Tip tekshiruvi**

Run: `cd client && npx tsc --noEmit`
Expected: 0 error.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/dashboard/home-next-lessons.tsx \
        client/src/components/dashboard/home-overview.tsx
git commit -m "Bosh sahifa: «Keyingi darslar» bloki va ikki ustunli joylashuv"
```

---

### Task 5: Yakuniy tekshiruv

**Files:**
- Modify: kerak bo'lsa `client/src/components/dashboard/*` (faqat topilgan kamchiliklar)

**Interfaces:**
- Consumes: Task 1–4 ning hammasi
- Produces: yangi eksport yo'q

- [ ] **Step 1: Rollarni qo'lda aylanib chiqish**

Har bir rol bilan `/` ni oching va tekshiring:

| Rol | Kutilgan |
|---|---|
| CEO (1) | Pul + Odamlar + E'tibor (outreach qatorlari bilan) + Keyingi darslar |
| Filial direktori (2) | CEO bilan bir xil |
| Administrator (3) | Pul kartalari **yo'q**, qolgani bor |
| Kassir (5) | Pul yo'q, «E'tibor» blokida faqat «Eng katta qarzdorlar» |
| Faqat o'qituvchi (4) | Eski jadval sahifasi, panel emas |

Agar akkaunt topilmasa: `dashboard-client.tsx` dagi `roleIds` ni vaqtincha qo'lda o'zgartirib (`const roleIds = [3];`) tekshiring va **albatta orqaga qaytaring**.

- [ ] **Step 2: Mobil ko'rinish**

Brauzer devtools'da 390px kenglikda `/` ni oching. Tekshiring: pul kartalari 2×2, sanagichlar 2×2, «E'tibor» va «Keyingi darslar» bir-birining ostida, gorizontal skroll **yo'q**.

- [ ] **Step 3: Qorong'i rejim**

Sozlamalardan dark mode'ni yoqing. Tekshiring: `text-red-600`, `text-emerald-600`, `text-orange-600` matnlar o'qilarli. O'qilmasa, `dark:` variant qo'shing (masalan `text-red-600 dark:text-red-400`) — loyihaning boshqa joylarida ishlatilgan naqsh.

- [ ] **Step 4: Lint va build**

Run: `cd client && npm run lint`
Expected: xatosiz.

Run: `cd client && npx tsc --noEmit`
Expected: 0 error.

Run: `cd client && npm run build`
Expected: build muvaffaqiyatli; `/schedule` route ro'yxatda ko'rinadi.

- [ ] **Step 5: Barcha testlar**

Run: `cd client && npx vitest run`
Expected: barcha testlar PASS, jumladan `dashboard-home-visibility.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A client/src
git commit -m "Bosh sahifa: mobil, qorong'i rejim va lint tuzatishlari"
```

---

## Faza 1 tugagach

Bu nuqtada `/` localhostda to'liq ko'rinadi, lekin raqamlar **soxta**. Foydalanuvchi joylashuvni tasdiqlagach Faza 2 boshlanadi:

1. `server/src/dashboard/dashboard-summary.service.ts` + `GET /dashboard/summary` + jest testlari
2. `home-overview.tsx` da `HOME_FIXTURE` o'rniga `useQuery`
3. `home-fixture.ts` o'chiriladi
4. Yuklanish holati `HomeSkeleton` ga, `failed` bo'limlar uchun «ma'lumot olinmadi» holati

Faza 2 uchun alohida reja yoziladi.
