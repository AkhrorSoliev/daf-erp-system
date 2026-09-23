# Sozlamalar sahifasi (1-bosqich): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar'dagi «Sozlamalar» dropdown'ini olib tashlab, `/settings` ni
telefon va kompyuter uchun bitta ro'yxat sahifasiga aylantirish — punktga
bosilganda hozirgi sahifaning o'zi ochiladi.

**Architecture:** `settings-nav.ts` — ro'yxatning yagona manbai: har bir
punktga majburiy `description`, rol filtri esa sof funksiya
`getVisibleSettingsSections(roleIds)` (vitest bilan qotiriladi). Hozirgi
`SettingsMobileMenu` hamma ekran uchun `SettingsMenu` ga aylanadi va Server
Component `/settings/page.tsx` ichida chiziladi; `SettingsLayoutShell` dagi
mobil shox va `page.tsx` dagi desktop redirect o'chadi. Sidebar'da «Sozlamalar»
bandidan `children` olinadi — `AppSidebar` uni o'zgarishsiz oddiy havola
sifatida chizadi.

**Tech Stack:** Next.js 16.2 (App Router), React 19, Tailwind 4,
lucide-react, zustand (`useAuth`), vitest 4 — faqat `node` muhiti, komponent
render testlari yo'q (`client/vitest.config.mts` da ataylab).

**Spec:** [2026-09-23-sozlamalar-sahifasi-design.md](../specs/2026-09-23-sozlamalar-sahifasi-design.md)

## Global Constraints

- **Til:** foydalanuvchi matni, kod izohlari va commit xabarlari lotin o'zbekchada. `client/CLAUDE.md` esa faqat inglizcha (uning «Language Policy» bo'limi); UI satrlaridan iqtibos bundan mustasno.
- **Ish joyi:** `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/sozlamalar-sahifasi`, shox `worktree-sozlamalar-sahifasi` (`origin/main` 0534d57e dan). Asosiy papkaga (`/Users/a1111/Desktop/daf-erp-system`, shox `feat/sozlamalar-sabablar`, saqlanmagan o'zgarishlar bilan) **tegilmaydi**.
- **Buyruqlar** `client/` ichidan: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/sozlamalar-sahifasi/client`.
- **Har commit** oxirida: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Faqat aniq fayllar `git add` qilinadi — `git add -A` / `git add .` ishlatilmaydi.
- **Backend o'zgarmaydi** — `server/` ga tegilmaydi.
- **Rollar o'zgarmaydi:** har bir punktning `visibleForRoles` qiymati aynan saqlanadi; `SettingsLayoutShell` dagi rol himoyalari (faqat-o'qituvchi → `/`; Administrator → Xodimlar/Filiallar yopiq; faqat CEO → Arxiv, DaF normasi; To'lov → CEO va filial direktori) o'zgarmaydi.
- **Ichki sozlama sahifalari o'zgarmaydi** (`/settings/courses`, `/settings/rooms` va h.k.).
- **Next.js 16:** `client/AGENTS.md` — bu versiya o'quv ma'lumotlaridan farq qiladi. Sahifa default holatda Server Component; `"use client"` faqat `SettingsMenu` da.
- **Boshlang'ich holat:** `npm test` — 51 fayl, 419 test yashil; `npm run typecheck` toza; `npx eslint src` — `0 errors, 80 warnings`. Oxirida ham 0 error, warning 80 dan oshmaydi.
- **Izohlar matni** (spec §3, so'zma-so'z):

| Punkt                  | `description`                                              |
| ---------------------- | ---------------------------------------------------------- |
| Kurslar                | Kurslarni boshqarish va yangi kurs qo'shish                |
| Xonalar                | Filiallardagi xonalarni boshqarish                         |
| Dam olish kunlari      | Rasmiy bayramlar va dam olish kunlari                      |
| Sabablar               | Guruhdan chiqarish, o'tkazish va ustoz almashish sabablari |
| Avtomatik pauza        | Ketma-ket dars qoldirgan o'quvchini pauzaga o'tkazish      |
| Arxiv                  | O'chirilgan ma'lumotlar                                    |
| DaF normasi            | O'quvchi ilovada qancha ishlashi kerakligi                 |
| Kompaniya ma'lumotlari | Kompaniya nomi, telefon va asosiy ma'lumotlar              |
| Xodimlar               | Xodimlarni boshqarish va rollarni belgilash                |
| Filiallar              | Filiallarni boshqarish va yangi filial qo'shish            |
| Telegram guruhlar      | Botga ulangan Telegram guruhlar                            |
| To'lov                 | Kurs to'lov modeli va hisob-kitob qoidalari                |

---

## Fayllar tuzilishi

| Fayl | Vazifa | Task |
| --- | --- | --- |
| `client/src/lib/settings-nav.ts` | Sozlama punktlari (nom, manzil, ikonka, izoh, rollar) va rol filtri — yagona manba | 1 |
| `client/src/lib/settings-nav.test.ts` (yangi) | Kim qaysi punktni ko'rishi va har punktda izoh borligi | 1 |
| `client/src/components/settings/settings-menu.tsx` (`settings-mobile-menu.tsx` dan `git mv`) | `/settings` ro'yxatini chizadigan client komponent | 2 |
| `client/src/app/(dashboard)/settings/page.tsx` | Server Component: sarlavha + `SettingsMenu` | 2 |
| `client/src/components/settings/settings-layout-shell.tsx` | Rol himoyalari; mobil shox olib tashlanadi | 2 |
| `client/src/lib/nav-items.ts` | «Sozlamalar» bandi — oddiy havola | 3 |
| `client/src/lib/nav-items.test.ts` (yangi) | «Sozlamalar» qayta dropdown bo'lib qolmasin | 3 |
| `client/CLAUDE.md` | Yangi sozlama sahifasini qo'shish qoidasi | 3 |

`client/src/components/app-sidebar.tsx` ga **tegilmaydi**: `children` yo'q band
u yerda allaqachon oddiy havola bo'lib chiziladi va
`pathname.startsWith("/settings")` bilan faol bo'ladi.

---

### Task 1: `settings-nav.ts` — izoh maydoni va rol filtri

**Files:**
- Modify: `client/src/lib/settings-nav.ts` (butun fayl, hozir 108 qator)
- Test: `client/src/lib/settings-nav.test.ts` (yangi)

**Interfaces:**
- Consumes: yo'q.
- Produces (Task 2 va 3 shularga tayanadi):
  - `export interface SettingsNavItem { title: string; url: string; icon: LucideIcon; description: string; visibleForRoles?: number[] }` — `children` maydoni **yo'q**.
  - `export interface SettingsNavSection { title: string; items: SettingsNavItem[] }` (hozir eksport qilinmagan — endi eksport qilinadi).
  - `export const settingsNavSections: SettingsNavSection[]`
  - `export function getVisibleSettingsSections(roleIds: number[]): SettingsNavSection[]`

- [ ] **Step 1: Yiqiladigan testni yozish**

`client/src/lib/settings-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getVisibleSettingsSections, settingsNavSections } from "./settings-nav";

/**
 * /settings sahifasi shu ro'yxatni chizadi. `visibleForRoles` backend'dagi
 * @Roles() bilan mos bo'lishi shart: 403 ga olib boradigan havola havolaning
 * yo'qligidan yomonroq. Shuning uchun har rolning kutilgan ro'yxati bu yerda
 * ochiq yozilgan — yangi punkt qo'shsangiz, uni kim ko'rishini shu yerda ham
 * ongli ravishda belgilaysiz.
 */

const CEO = 1;
const BRANCH_DIRECTOR = 2;
const ADMINISTRATOR = 3;
const CASHIER = 5;

/** Bo'lim nomi → shu bo'limda ko'rinadigan punkt nomlari. */
function visibleTitles(roleIds: number[]): Record<string, string[]> {
  return Object.fromEntries(
    getVisibleSettingsSections(roleIds).map((section) => [
      section.title,
      section.items.map((item) => item.title),
    ]),
  );
}

describe("getVisibleSettingsSections — /settings da kim nimani ko'radi", () => {
  it("CEO hamma 12 ta punktni ikki bo'limda ko'radi", () => {
    const sections = getVisibleSettingsSections([CEO]);
    expect(sections.map((section) => section.title)).toEqual(["Administratsiya", "CEO"]);
    expect(sections.flatMap((section) => section.items)).toHaveLength(12);
  });

  it("filial direktori 10 ta punktni ko'radi — Arxiv va DaF normasisiz", () => {
    const titles = Object.values(visibleTitles([BRANCH_DIRECTOR])).flat();
    expect(titles).toHaveLength(10);
    expect(titles).not.toContain("Arxiv");
    expect(titles).not.toContain("DaF normasi");
  });

  it("administrator 5 ta punktni ko'radi", () => {
    expect(visibleTitles([ADMINISTRATOR])).toEqual({
      Administratsiya: ["Kurslar", "Xonalar", "Dam olish kunlari", "Sabablar"],
      CEO: ["Kompaniya ma'lumotlari"],
    });
  });

  it("rolsiz foydalanuvchi faqat ochiq punktlarni ko'radi, bo'sh bo'lim chiqmaydi", () => {
    expect(visibleTitles([])).toEqual({
      Administratsiya: ["Kurslar", "Xonalar", "Dam olish kunlari"],
    });
  });

  it("bir nechta rol bo'lsa, ko'rinish rollar birlashmasi", () => {
    expect(visibleTitles([ADMINISTRATOR, CASHIER])).toEqual(visibleTitles([ADMINISTRATOR]));
  });
});

describe("settingsNavSections", () => {
  it("har bir punktda izoh bor — u /settings ro'yxatida nom ostida chiqadi", () => {
    const withoutDescription = settingsNavSections
      .flatMap((section) => section.items)
      .filter((item) => !item.description?.trim())
      .map((item) => item.title);
    expect(withoutDescription).toEqual([]);
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx vitest run src/lib/settings-nav.test.ts`
Expected: FAIL — `Tests  6 failed (6)`. Beshtasida
`TypeError: getVisibleSettingsSections is not a function`; oxirgisida
`AssertionError` — 12 ta punkt nomi (`'Kurslar'` dan boshlab) `[]` ga teng
emas, chunki hali hech bir punktda `description` yo'q.

- [ ] **Step 3: `settings-nav.ts` ni to'liq almashtirish**

`client/src/lib/settings-nav.ts` — butun fayl (mavjud izohlar saqlanadi,
punktlar tartibi va `visibleForRoles` qiymatlari o'zgarmaydi):

```ts
import {
  BookOpen,
  DoorOpen,
  CalendarOff,
  PauseCircle,
  ListChecks,
  Archive,
  Users,
  Building,
  Building2,
  Send,
  Wallet,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

// /settings sahifasidagi ro'yxatning yagona manbai. Sidebar'da «Sozlamalar» —
// dropdown emas, shu sahifaga oddiy havola: yangi sozlama sahifasi faqat shu
// yerga qo'shiladi va /settings da o'zi chiqadi.

export interface SettingsNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** /settings ro'yxatida nom ostida chiqadigan bir qatorlik izoh. */
  description: string;
  /** When set, only users with at least one matching role ID see the item. Omit to show to all. */
  visibleForRoles?: number[];
}

export interface SettingsNavSection {
  title: string;
  items: SettingsNavItem[];
}

export const settingsNavSections: SettingsNavSection[] = [
  {
    title: "Administratsiya",
    items: [
      {
        title: "Kurslar",
        url: "/settings/courses",
        icon: BookOpen,
        description: "Kurslarni boshqarish va yangi kurs qo'shish",
      },
      {
        title: "Xonalar",
        url: "/settings/rooms",
        icon: DoorOpen,
        description: "Filiallardagi xonalarni boshqarish",
      },
      {
        title: "Dam olish kunlari",
        url: "/settings/holidays",
        icon: CalendarOff,
        description: "Rasmiy bayramlar va dam olish kunlari",
      },
      {
        // Backend: /student-exit-reasons, /enrollment-transfer-reasons,
        // /group-teacher-change-reasons — @Roles('CEO', 'Branch Director',
        // 'Administrator'). visibleForRoles shu qamrovga ANIQ mos: 403ga
        // olib boradigan havola havolaning yo'qligidan yomonroq.
        title: "Sabablar",
        url: "/settings/reasons",
        icon: ListChecks,
        description: "Guruhdan chiqarish, o'tkazish va ustoz almashish sabablari",
        visibleForRoles: [1, 2, 3],
      },
      {
        // O'qish CEO va filial direktoriga; yozish serverda faqat CEO —
        // sozlama butun kompaniyaga taalluqli.
        title: "Avtomatik pauza",
        url: "/settings/absence-pause",
        icon: PauseCircle,
        description: "Ketma-ket dars qoldirgan o'quvchini pauzaga o'tkazish",
        visibleForRoles: [1, 2],
      },
      {
        title: "Arxiv",
        url: "/settings/archive",
        icon: Archive,
        description: "O'chirilgan ma'lumotlar",
        visibleForRoles: [1],
      },
      {
        title: "DaF normasi",
        url: "/settings/daf",
        icon: Smartphone,
        description: "O'quvchi ilovada qancha ishlashi kerakligi",
        visibleForRoles: [1],
      },
    ],
  },
  {
    title: "CEO",
    items: [
      {
        title: "Kompaniya ma'lumotlari",
        url: "/settings/general",
        icon: Building,
        description: "Kompaniya nomi, telefon va asosiy ma'lumotlar",
        visibleForRoles: [1, 2, 3],
      },
      {
        title: "Xodimlar",
        url: "/settings/employees",
        icon: Users,
        description: "Xodimlarni boshqarish va rollarni belgilash",
        visibleForRoles: [1, 2],
      },
      {
        title: "Filiallar",
        url: "/settings/branches",
        icon: Building2,
        description: "Filiallarni boshqarish va yangi filial qo'shish",
        visibleForRoles: [1, 2],
      },
      {
        title: "Telegram guruhlar",
        url: "/settings/telegram-groups",
        icon: Send,
        description: "Botga ulangan Telegram guruhlar",
        visibleForRoles: [1, 2],
      },
      {
        // Backend: GET/PATCH /settings/payment — @Roles('CEO', 'Branch
        // Director'). visibleForRoles quyida shu qamrovga ANIQ mos —
        // 403ga olib boradigan havola havolaning yo'qligidan yomonroq.
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        visibleForRoles: [1, 2],
      },
    ],
  },
];

/**
 * Foydalanuvchi rollariga ko'ra /settings da ko'rinadigan bo'limlar.
 * `visibleForRoles` yo'q punkt hammaga ochiq; punktlari qolmagan bo'lim
 * natijaga kirmaydi.
 */
export function getVisibleSettingsSections(roleIds: number[]): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !item.visibleForRoles || item.visibleForRoles.some((id) => roleIds.includes(id)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `npx vitest run src/lib/settings-nav.test.ts`
Expected: PASS — `Tests  6 passed (6)`.

Run: `npm run typecheck`
Expected: chiqish kodi 0, xato yo'q. (`nav-items.ts` hali
`settingsNavSections` ni `NavItemChild[]` ga yoyadi — `children` yo'qligi va
qo'shimcha `description` bu tayinlashni buzmaydi.)

Run: `npm test`
Expected: `Test Files  52 passed (52)`, `Tests  425 passed (425)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings-nav.ts src/lib/settings-nav.test.ts
git commit -m "$(cat <<'EOF'
Sozlamalar ro'yxati: har punktga izoh va rol filtri

settings-nav.ts /settings sahifasining yagona manbai bo'ladi: har punktda
majburiy description, kim nimani ko'rishi getVisibleSettingsSections da.
Hech kim ishlatmaydigan children maydoni olib tashlandi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `/settings` — hamma ekran uchun ro'yxat sahifasi

**Files:**
- Rename + rewrite: `client/src/components/settings/settings-mobile-menu.tsx` → `client/src/components/settings/settings-menu.tsx`
- Modify: `client/src/app/(dashboard)/settings/page.tsx` (butun fayl, hozir 19 qator)
- Modify: `client/src/components/settings/settings-layout-shell.tsx:5,7,12,50-69`

**Interfaces:**
- Consumes (Task 1): `getVisibleSettingsSections(roleIds: number[]): SettingsNavSection[]` va `SettingsNavItem.description: string` — `@/lib/settings-nav` dan. `useAuth((s) => s.user)` → `AuthUser | null`, `user.roles: { id: number; name: string }[]` (`@/hooks/use-auth`).
- Produces: `export function SettingsMenu()` — `@/components/settings/settings-menu` (props yo'q; `user` yo'q paytda `null` qaytaradi).

**Test haqida:** `client/vitest.config.mts` ataylab faqat `node` muhitida
(jsdom va testing-library yo'q), shuning uchun bu task uchun render testi
yozilmaydi. Komponent tayanadigan mantiq (rol filtri) Task 1 da testlangan.
Bu task'ning tekshiruvi — typecheck, lint, eski nomga havola qolmagani va
Task 4 dagi build + brauzer.

- [ ] **Step 1: Faylni yangi nomga ko'chirish**

```bash
git mv src/components/settings/settings-mobile-menu.tsx src/components/settings/settings-menu.tsx
```

- [ ] **Step 2: `settings-menu.tsx` ni to'liq almashtirish**

`client/src/components/settings/settings-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getVisibleSettingsSections } from "@/lib/settings-nav";
import { useAuth } from "@/hooks/use-auth";

export function SettingsMenu() {
  const user = useAuth((s) => s.user);

  // Sahifa qayta yuklanganda foydalanuvchi cookie'dan useEffect ichida
  // o'qiladi — birinchi render'da u hali yo'q. Shu lahzada chizsak, avval
  // faqat hammaga ochiq punktlar chiqib, keyin ro'yxat sakrab kengayardi.
  if (!user) return null;

  const sections = getVisibleSettingsSections(user.roles.map((r) => r.id));

  return (
    <div className="max-w-3xl space-y-5">
      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h2>
          <div className="divide-y rounded-lg border bg-card">
            {section.items.map((item) => (
              <Link
                key={item.url}
                href={item.url}
                className="flex items-center gap-3 px-4 py-3 outline-none transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <item.icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground sm:text-sm">{item.description}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx` ni to'liq almashtirish**

`client/src/app/(dashboard)/settings/page.tsx` — `"use client"` yo'q, bu
Server Component. Tashqaridagi `SettingsLayoutShell` bolalarni
`<div className="space-y-4">` ga o'raydi, shuning uchun fragment ichidagi ikki
blok orasida bo'shliq o'sha yerdan keladi:

```tsx
import { SettingsMenu } from "@/components/settings/settings-menu";

export default function SettingsPage() {
  return (
    <>
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">Sozlamalar</h1>
        <p className="text-sm text-muted-foreground">Tizim sozlamalari va boshqaruv</p>
      </div>
      <SettingsMenu />
    </>
  );
}
```

- [ ] **Step 4: `settings-layout-shell.tsx` dan mobil shoxni olib tashlash**

Uchta aniq tahrir; rol himoyalari (13–48-qatorlar) **o'zgarmaydi**.

4a. Importlar — eski:

```tsx
import { useEffect } from "react";
import { SettingsMobileMenu } from "./settings-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
```

yangi:

```tsx
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
```

4b. Hook — eski:

```tsx
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
```

yangi:

```tsx
  const router = useRouter();
  const user = useAuth((s) => s.user);
```

4c. Fayl oxiri — eski:

```tsx
  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";

  if (isMobile && isSettingsRoot) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">
            Sozlamalar
          </h1>
          <p className="text-sm text-muted-foreground">
            Tizim sozlamalari va boshqaruv
          </p>
        </div>
        <SettingsMobileMenu />
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
```

yangi:

```tsx
  return <div className="space-y-4">{children}</div>;
}
```

- [ ] **Step 5: Tekshirish**

Run: `grep -rn "SettingsMobileMenu\|settings-mobile-menu" src`
Expected: hech narsa chiqmaydi (chiqish kodi 1).

Run: `grep -n "useIsMobile\|useRouter" "src/app/(dashboard)/settings/page.tsx"`
Expected: hech narsa chiqmaydi (redirect to'liq olib tashlangan).

Run: `npm run typecheck`
Expected: chiqish kodi 0, xato yo'q.

Run: `npx eslint src/components/settings/settings-menu.tsx src/components/settings/settings-layout-shell.tsx "src/app/(dashboard)/settings/page.tsx"`
Expected: hech narsa chiqmaydi (0 problems).

Run: `npm test`
Expected: `Test Files  52 passed (52)`, `Tests  425 passed (425)` (Task 1 dagi bilan bir xil).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/settings-menu.tsx src/components/settings/settings-layout-shell.tsx "src/app/(dashboard)/settings/page.tsx"
git status --short
```

Expected `git status --short`: `R  src/components/settings/settings-mobile-menu.tsx -> src/components/settings/settings-menu.tsx` (yoki `D` + `A` juftligi), `M` shell va page — boshqa hech narsa.

```bash
git commit -m "$(cat <<'EOF'
/settings endi hamma ekran uchun ro'yxat sahifasi

Desktopdagi /settings/courses redirecti va shell'dagi faqat-telefon shoxi
olib tashlandi. SettingsMobileMenu hamma ekran uchun SettingsMenu bo'ldi:
har qatorda nom, izoh va strelka; kengligi max-w-3xl.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Sidebar — «Sozlamalar» oddiy havola + `CLAUDE.md` qoidasi

**Files:**
- Test: `client/src/lib/nav-items.test.ts` (yangi)
- Modify: `client/src/lib/nav-items.ts:21,45,93-99`
- Modify: `client/CLAUDE.md:421` va 422-qatordan keyin yangi bo'lim

**Interfaces:**
- Consumes (Task 1–2): `/settings` sahifasi mavjud va ro'yxatni chizadi; `getVisibleSettingsSections` va `settings-nav.test.ts` nomlari (`CLAUDE.md` matnida tilga olinadi).
- Produces: `navItems` dagi `url: "/settings"` bandida `children` yo'q.

- [ ] **Step 1: Yiqiladigan testni yozish**

`client/src/lib/nav-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navItems — «Sozlamalar»", () => {
  it("dropdown emas, /settings sahifasiga oddiy havola", () => {
    const settings = navItems.find((item) => item.url === "/settings");
    expect(settings).toBeDefined();
    // Punktlar 12 taga yetib, ochilganda sidebar'ni surib yuborardi — ular
    // /settings sahifasiga ko'chdi (settings-nav.ts). children qaytsa,
    // AppSidebar yana dropdown chizadi.
    expect(settings?.children).toBeUndefined();
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx vitest run src/lib/nav-items.test.ts`
Expected: FAIL — `Tests  1 failed (1)`: `AssertionError` — 12 ta sozlama
punktidan iborat massiv (`title: 'Kurslar'` dan boshlab) `undefined` emas.

- [ ] **Step 3: `nav-items.ts` ni tahrirlash**

3a. 21-qatordagi importni o'chirish — eski:

```ts
import { reportsNavSections } from "./reports-nav";
import { settingsNavSections } from "./settings-nav";
import { dafNavItems } from "./daf-nav";
```

yangi:

```ts
import { reportsNavSections } from "./reports-nav";
import { dafNavItems } from "./daf-nav";
```

3b. 45-qatordagi konstantani o'chirish — eski:

```ts
const reportsChildren: NavItemChild[] = reportsNavSections.flatMap((s) => s.items);
const settingsChildren: NavItemChild[] = settingsNavSections.flatMap((s) => s.items);
```

yangi:

```ts
const reportsChildren: NavItemChild[] = reportsNavSections.flatMap((s) => s.items);
```

3c. «Sozlamalar» bandi — eski:

```ts
  {
    title: "Sozlamalar",
    url: "/settings",
    icon: Settings,
    visibleForRoles: [1, 2, 3],
    children: settingsChildren,
  },
];
```

yangi:

```ts
  // Dropdown emas: punktlar 12 taga yetib, ochilganda sidebar'ni surib
  // yuborardi. Ro'yxat /settings sahifasida — manbasi settings-nav.ts.
  {
    title: "Sozlamalar",
    url: "/settings",
    icon: Settings,
    visibleForRoles: [1, 2, 3],
  },
];
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `npx vitest run src/lib/nav-items.test.ts`
Expected: PASS — `Tests  1 passed (1)`.

Run: `npm run typecheck`
Expected: chiqish kodi 0, xato yo'q.

Run: `npx eslint src/lib/nav-items.ts src/lib/nav-items.test.ts`
Expected: hech narsa chiqmaydi.

Run: `npm test`
Expected: `Test Files  53 passed (53)`, `Tests  426 passed (426)`.

- [ ] **Step 5: `client/CLAUDE.md` ni yangilash**

5a. «Sidebar Active State» bo'limidagi misol (421-qator) endi mavjud bo'lmagan
sidebar havolasiga ishora qiladi — eski:

```md
- This ensures the link stays highlighted when navigating to nested/child routes (e.g. `/settings/courses` stays active on `/settings/courses/1`)
```

yangi:

```md
- This ensures the link stays highlighted when navigating to nested/child routes (e.g. `/settings` stays active on `/settings/courses/1`)
```

5b. Shu bo'limning oxirgi qatoridan keyin (`- Exception: the home route ...`
qatoridan keyin, `### Toast Notifications` dan oldin) yangi bo'lim — eski:

```md
- Exception: the home route (`/`) must use exact match (`pathname === "/"`) to avoid matching every route

### Toast Notifications
```

yangi:

```md
- Exception: the home route (`/`) must use exact match (`pathname === "/"`) to avoid matching every route

### Settings Page (`/settings`)

- **Settings is a page, not a sidebar dropdown.** The sidebar "Sozlamalar" item is a plain link to `/settings`, which lists every settings page grouped into sections; each row shows a title and a one-line description. The dropdown was removed when it reached 12 entries and pushed the rest of the sidebar down — do not add `children` back to that nav item (`src/lib/nav-items.test.ts` fails if you do).
- **Adding a settings page:** add one entry to `settingsNavSections` in `src/lib/settings-nav.ts` with `title`, `url`, `icon`, a one-line Uzbek `description` (required — it is shown under the title) and `visibleForRoles` matching the backend `@Roles()` of the page's endpoints. The page then appears on `/settings`; nothing else in navigation changes.
- Role filtering for the list is `getVisibleSettingsSections(roleIds)` in the same file, covered by `src/lib/settings-nav.test.ts`. Update the expected per-role lists there when you add an entry — the friction is deliberate: who sees a settings page must be a conscious choice.
- Hiding a row is not access control: a restricted settings route still needs a redirect in `SettingsLayoutShell` and a backend `@Roles()` guard (see the RBAC rules above).

### Toast Notifications
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav-items.ts src/lib/nav-items.test.ts CLAUDE.md
git commit -m "$(cat <<'EOF'
Sidebar: «Sozlamalar» dropdown emas, /settings ga oddiy havola

Punktlar 12 taga yetib, ochilganda sidebar'ni surib yuborardi; ular endi
/settings sahifasida. nav-items.test.ts dropdown qaytib qo'shilishini
ushlaydi. CLAUDE.md ga yangi sozlama sahifasini qo'shish qoidasi yozildi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Yakuniy tekshiruv — build va brauzer

Bu task'ni **asosiy sessiya (controller)** bajaradi, subagent emas: brauzerda
login kerak bo'lsa, foydalanuvchidan so'raladi (parol hech qachon Claude
tomonidan kiritilmaydi).

**Files:** kod o'zgarmaydi. Vaqtinchalik: `client/.env.local` (gitignore'da —
`client/.gitignore` → `.env*`) va worktree ildizidagi `.claude/launch.json`
(gitignore'da **emas** — commit qilinmaydi, oxirida o'chiriladi).

- [ ] **Step 1: To'liq test, lint, build**

Run: `npm test`
Expected: `Test Files  53 passed (53)`, `Tests  426 passed (426)`.

Run: `npx eslint src 2>&1 | tail -2`
Expected: `✖ 80 problems (0 errors, 80 warnings)` — 0 error, warning 80 dan oshmagan.

Run: `npm run build`
Expected: build muvaffaqiyatli; route ro'yxatida `/settings` bor.

- [ ] **Step 2: Dev server uchun muhit**

```bash
cp /Users/a1111/Desktop/daf-erp-system/client/.env.local /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/sozlamalar-sahifasi/client/.env.local
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Expected: 4000-portda backend tinglayapti; 3000-port bo'sh. Backend CORS faqat
`http://localhost:3000` ga ruxsat beradi (`server/src/main.ts`), shuning uchun
dev server aynan 3000-portda bo'lishi shart. 3000 band bo'lsa — to'xtab,
foydalanuvchidan so'rang. 4000 bo'sh bo'lsa — foydalanuvchiga ayting, login
ishlamaydi.

`/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/sozlamalar-sahifasi/.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "client-sozlamalar",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "client", "run", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 3: Brauzerda — desktop**

`preview_start` (`name: "client-sozlamalar"`), keyin
`http://localhost:3000/settings`. `/login` ga o'tib ketsa — foydalanuvchidan
brauzer panelida login qilishni so'rang va kuting.

CEO bilan kutilgan natija (boshqa rol bo'lsa — spec §5 jadvali):

- Sidebar'da «Sozlamalar» yonida strelka yo'q, bosilganda ochilmaydi; `/settings` da faol (yonib turadi).
- `/settings`: «Sozlamalar» sarlavhasi va «Tizim sozlamalari va boshqaruv»; «ADMINISTRATSIYA» — 7 qator, «CEO» — 5 qator; har qatorda ikonka, nom, izoh, `›`; ro'yxat kengligi ~768px dan oshmaydi.
- «Kurslar» ga bosish → URL `/settings/courses`, sahifa avvalgidek; sidebar'da «Sozlamalar» hamon faol.
- Breadcrumb'dagi «Sozlamalar» → `/settings` ro'yxati (Kurslarga redirect **yo'q**).
- Sidebar icon rejimiga yig'ilganda «Sozlamalar» ikonkasi `/settings` ga havola, tooltip bilan.
- `read_console_messages` (`onlyErrors: true`) — yangi xato yo'q.

- [ ] **Step 4: Brauzerda — telefon**

`resize_window` (`preset: "mobile"`), sahifani qayta yuklash:

- `/settings` da o'sha ro'yxat; uzun izoh ikki qatorga o'tadi, kesilmaydi; gorizontal skroll yo'q.
- «Xonalar» ni ochish → tepada «← Sozlamalar» → bosilganda ro'yxatga qaytadi.

- [ ] **Step 5: Tozalash**

`preview_stop`; `resize_window` (`preset: "desktop"`);
`.claude/launch.json` ni o'chirish.

Run: `git status --short`
Expected: bo'sh (`client/.env.local` gitignore'da; `.claude/launch.json` o'chirilgan).

- [ ] **Step 6: Shoxni yakunlash**

`superpowers:finishing-a-development-branch` skill'i bilan — merge/PR
variantlarini foydalanuvchiga taklif qilish.
