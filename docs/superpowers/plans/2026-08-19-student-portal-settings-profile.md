# O'quvchi portali — Sozlamalar va Profil qayta qurilishi (Faza 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi portalida Sozlamalar sahifasini «ilova qanday ishlaydi» ekraniga aylantirish, shaxsiy ma'lumot tahririni Profilga ko'chirish va mavzu (dark/light) boshqaruvini butun portalda bitta komponentga birlashtirish.

**Architecture:** Faqat frontend. Uchta yangi Lumio primitivi (`ThemeSegmented`, `Section`, `SegmentedControl` ning `compact` rejimi) qo'shiladi; ikkita mavjud dialog o'z fayllariga ajratiladi; Sozlamalar va Profil sahifalari shu primitivlar ustida qayta yig'iladi. Desktop rail'dagi admin `ThemeToggle` portal komponentiga almashadi. Backend, ma'lumot modeli va API o'zgarmaydi.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, `next-themes`, `@tanstack/react-query`, `@phosphor-icons/react`, `react-hot-toast`, `axios`.

**Spec:** `docs/superpowers/specs/2026-08-19-student-portal-settings-profile-design.md`
**Audit:** `docs/student-portal-ux-audit.md`

## Global Constraints

- **UI matni faqat o'zbekcha (lotin alifbosi).** Kirill yoki arab harflari ishlatilmaydi. (`client/CLAUDE.md` → "The entire UI of this project is in **Uzbek**".)
- **Kod izohlari inglizcha** — `lumio/` va `student-portal/` dagi mavjud fayllar shunday yozilgan; yangi fayllar shu uslubni davom ettiradi.
- **Portal ekranlari faqat Lumio primitivlaridan quriladi**, xom shadcn'dan emas (`client/CLAUDE.md:695`). Istisno: `Dialog` — bu Faza 1 da o'zgarmaydi, `BottomSheet` ga o'tish Faza 2 (audit U1).
- **`client/src/components/theme-toggle.tsx` ga TEGILMAYDI.** U portaldan tashqarida oltita joyda ishlatiladi: `app-sidebar.tsx:247`, `dashboard-header.tsx:72`, `(auth)/login/page.tsx:22,51,70`, `error.tsx:23`, `not-found.tsx:10`.
- **Backend o'zgarishi yo'q.** Barcha endpoint'lar mavjud: `PATCH /student-portal/name`, `PATCH /student-portal/password`, `POST /student-portal/photo`, `DELETE /student-portal/photo` (`server/src/students/student-portal.controller.ts`).
- **ADR yozilmaydi.** ADR ma'lumot modeli, pul semantikasi, filial qoidasi, fail-open/closed tanlovi yoki tashqi xizmat tanlovi o'zgarganda yoziladi (`client/CLAUDE.md` → «Arxitektura qarorlari»). Bu ish — UI qayta tashkil qilish, ularning hech biriga tegmaydi.
- **Prod API bilan sinalmaydi.** Ism va parol o'zgartirish haqiqiy o'quvchi yozuvini o'zgartiradi. Task 0 klientni lokal backendga qaytaradi.
- **Har bir task oxirida commit.** Har commit ishlaydigan holatni qoldiradi: hech bir oraliq commit'da foydalanuvchi imkoniyati yo'qolmaydi.

## Testlash strategiyasi (o'qing — odatdagidan farq qiladi)

Bu loyihada **komponent render test harnessi yo'q**. `client/vitest.config.mts` ataylab shunday sozlangan:

```
environment: "node",
include: ["src/**/*.test.ts"],
```

va faylning o'z izohida sababi yozilgan: «Unit tests only — no component rendering, no jsdom, no testing-library... Rendering tests would need a much larger toolchain and are not what this change needs.»

Faza 1 ning butun mazmuni prezentatsion (JSX tuzilishi, Tailwind klasslari, `next-themes` holati). Bu yerda soxta unit test yozish qiymat bermaydi, jsdom + testing-library qo'shish esa alohida qaror — spec §9 da qamrovdan tashqari deb belgilangan.

**Shuning uchun har bir taskning test tsikli:**

| Bosqich | Buyruq | Kutilgan natija |
|---|---|---|
| Tiplar | `cd client && npx tsc --noEmit` | xatosiz chiqadi |
| Lint | `cd client && npm run lint` | xatosiz chiqadi |
| Qo'lda | brauzerda, taskda ko'rsatilgan aniq ro'yxat bo'yicha | har bandi bajarilgan |

Qo'lda tekshiruv ro'yxati har taskda aniq yozilgan — «ko'rib chiqing» degan mavhum qadam yo'q.

---

## Task 0: Ish muhitini tayyorlash

**Files:** kod o'zgarmaydi

**Interfaces:**
- Consumes: —
- Produces: `feat/portal-settings-profile-rework` branch; lokal backend `localhost:4000` da; klient `localhost:3000` da lokal API'ga ulangan

Hozir klient dev serveri **prod API'ga** (`https://api.dafzentrum.uz/api`) ulangan holda ishlab turishi mumkin. Bu taskda ish tugamaguncha uni lokalga qaytaramiz.

- [ ] **Step 1: Branch ochish**

`main` da ishlamaymiz.

```bash
cd /Users/a1111/Desktop/daf-erp-system
git checkout -b feat/portal-settings-profile-rework
```

- [ ] **Step 2: Ishlab turgan klient dev serverini to'xtatish**

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
# chiqqan PID ning `next dev` ota-jarayonini to'xtating:
# ps -o ppid= -p <PID>  →  kill <PPID>
```

- [ ] **Step 3: `.env.local` lokalga qaraganini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && cat .env.local
```

Kutilgan: `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

Agar boshqa qiymat bo'lsa — to'g'rilang. Faylni prod manziliga **qaytarib qo'ymang**.

- [ ] **Step 4: Lokal backendni ko'tarish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npm run start:dev
```

Kutilgan: `Nest application successfully started`, port 4000.

- [ ] **Step 5: Klientni ko'tarish**

Alohida terminalda:

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npm run dev
```

- [ ] **Step 6: Boshlang'ich holat toza ekanini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz. Agar bu yerda xato bo'lsa — u sizning ishingizdan emas, avval shuni hal qiling.

- [ ] **Step 7: Boshlang'ich ekranlarni ko'rish**

Urug'langan dev bazasidagi student akkaunti bilan `http://localhost:3000` ga kiring, `/portal/settings` va `/portal/profile` ni oching. Hozirgi holatni eslab qoling — keyingi tasklarda taqqoslaysiz.

**Commit yo'q** — bu taskda kod o'zgarmaydi.

---

## Task 1: `SegmentedControl` ga `compact` rejimi va `ThemeSegmented` komponenti

**Files:**
- Modify: `client/src/components/student-portal/lumio/segmented-control.tsx`
- Create: `client/src/components/student-portal/lumio/theme-segmented.tsx`
- Modify: `client/src/components/student-portal/lumio/index.ts`

**Interfaces:**
- Consumes: mavjud `SegmentedControl<T>`, `SegmentOption<T>`; `lumio/icon` dan `Desktop`, `Sun`, `Moon`
- Produces:
  - `SegmentedControlProps<T>` ga qo'shimcha maydon: `compact?: boolean`
  - `ThemeSegmented({ variant?: "full" | "compact", className?: string })` — React komponenti
  - `ThemeMode = "system" | "light" | "dark"` tipi
  - Barrel eksportlari: `ThemeSegmented`, `ThemeSegmentedProps`, `ThemeMode`

- [ ] **Step 1: `SegmentedControl` ga `compact` prop qo'shish**

`client/src/components/student-portal/lumio/segmented-control.tsx` — interfeysga maydon qo'shing:

```ts
export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Icon-only: labels are dropped and become each button's aria-label. */
  compact?: boolean;
  className?: string;
}
```

Funksiya imzosida `compact = false` ni destrukturing qiling:

```ts
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  className,
}: SegmentedControlProps<T>) {
```

Va tugma renderini shunga almashtiring:

```tsx
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-label={compact ? o.label : undefined}
            aria-pressed={active}
            className={cn(
              "relative z-10 flex items-center justify-center font-display text-sm font-bold transition-colors",
              compact ? "h-8" : "h-10 gap-1.5",
              active ? "text-coral-600" : "text-ink-500",
            )}
          >
            {o.icon}
            {compact ? null : o.label}
          </button>
        );
```

Sirpanuvchi indikator (`<span aria-hidden>`) va track geometriyasiga **tegmang** — `p-1.5`, `bottom-1.5 top-1.5`, `+6px` / `-12px` hisoblari o'z holicha qoladi. Ular tugma balandligiga bog'liq emas.

- [ ] **Step 2: `ThemeSegmented` komponentini yaratish**

Yangi fayl `client/src/components/student-portal/lumio/theme-segmented.tsx`:

```tsx
"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Desktop, Sun, Moon } from "./icon";
import { SegmentedControl, type SegmentOption } from "./segmented-control";

export type ThemeMode = "system" | "light" | "dark";

// The portal's single source of truth for the theme choice. Rendered with
// labels on the Settings screen and icon-only in the desktop rail footer, so
// both places drive `next-themes` through the same three-way pick instead of
// the old cycle-button / segmented-control split.
const THEME_OPTIONS: SegmentOption<ThemeMode>[] = [
  { value: "system", label: "Tizim", icon: <Desktop size={16} weight="bold" /> },
  { value: "light", label: "Yorug'", icon: <Sun size={16} weight="bold" /> },
  { value: "dark", label: "Qorong'i", icon: <Moon size={16} weight="bold" /> },
];

export interface ThemeSegmentedProps {
  /** "full" — labelled (Settings), "compact" — icon-only (rail footer). */
  variant?: "full" | "compact";
  className?: string;
}

export function ThemeSegmented({
  variant = "full",
  className,
}: ThemeSegmentedProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const compact = variant === "compact";

  // `theme` is undefined until next-themes has read localStorage. Rendering the
  // control before that would both mismatch hydration and flash the wrong
  // segment, so hold a same-size placeholder: track padding (2 x 6px) plus the
  // button height — 52px full, 44px compact.
  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn(
          "rounded-pill bg-sunk",
          compact ? "h-[44px]" : "h-[52px]",
          className,
        )}
      />
    );
  }

  return (
    <SegmentedControl<ThemeMode>
      options={THEME_OPTIONS}
      value={(theme as ThemeMode) ?? "system"}
      onChange={setTheme}
      compact={compact}
      className={className}
    />
  );
}
```

- [ ] **Step 3: Barrel eksporti**

`client/src/components/student-portal/lumio/index.ts` — `SegmentedControl` eksportidan keyin qo'shing:

```ts
export {
  ThemeSegmented,
  type ThemeSegmentedProps,
  type ThemeMode,
} from "./theme-segmented";
```

- [ ] **Step 4: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz.

- [ ] **Step 5: Qo'lda tekshirish**

`/portal/settings` ni oching (hali eski sahifa — u `SegmentedControl` ni `compact` siz ishlatadi).

- [ ] Mavzu tanlagichi **ilgarigidek** ko'rinadi va ishlaydi — yorliqlar joyida, sirpanuvchi oq segment to'g'ri joyga siljiydi.
- [ ] Har uch variant (Tizim / Yorug' / Qorong'i) mavzuni o'zgartiradi.
- [ ] Sahifani yangilaganda tanlov saqlanadi va hidratsiya sakrashi ko'rinmaydi.

Ya'ni bu qadamda **hech narsa o'zgarmasligi** kerak — `compact` hali hech qayerda ishlatilmagan.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/lumio/segmented-control.tsx \
        client/src/components/student-portal/lumio/theme-segmented.tsx \
        client/src/components/student-portal/lumio/index.ts
git commit -m "feat(portal): add ThemeSegmented and a compact SegmentedControl mode"
```

---

## Task 2: Desktop rail'dagi mavzu tugmasini almashtirish

**Files:**
- Modify: `client/src/components/student-portal/lumio/side-rail.tsx`

**Interfaces:**
- Consumes: Task 1 dan `ThemeSegmented({ variant: "compact", className })`
- Produces: rail footer'da portal mavzu boshqaruvi; `@/components/theme-toggle` importi portaldan yo'qoladi

Bu task auditning **Q1** muammosini yopadi: bir holat, ikki mental model.

- [ ] **Step 1: Importni almashtirish**

`client/src/components/student-portal/lumio/side-rail.tsx`, 9-qator:

```diff
-import { ThemeToggle } from "@/components/theme-toggle";
+import { ThemeSegmented } from "./theme-segmented";
```

- [ ] **Step 2: Footer'ni yangilash**

Xuddi shu faylning oxiridagi footer blokini shunga almashtiring:

```tsx
      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
        <ThemeSegmented variant="compact" className="min-w-0 flex-1" />
        <LogoutButton variant="rail" />
      </div>
```

`justify-between` olib tashlandi: segmented endi `flex-1` bilan qolgan joyni egallaydi, chiqish tugmasi o'ng chekkada qoladi. Rail kengligi 240px, `p-3` dan keyin 216px qoladi — chiqish tugmasi 40px va gap 8px, ya'ni segmented ~168px oladi (har segment ~52px).

- [ ] **Step 3: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz. `ThemeToggle` importi olib tashlangani uchun «unused import» xatosi **bo'lmasligi** kerak — agar chiqsa, importni o'chirishni unutgansiz.

- [ ] **Step 4: Qo'lda tekshirish — desktop (1440px)**

- [ ] Rail footer'da endi lucide kvadrat tugma emas, uchta ikonkali Lumio pill turibdi.
- [ ] Uchala ikonka (monitor / quyosh / oy) ko'rinadi va joyiga sig'adi, chiqish tugmasi bilan ustma-ust tushmaydi.
- [ ] Rail'dan mavzuni o'zgartiring → `/portal/settings` ni oching → u yerdagi tanlagich **aynan shu variantni** ko'rsatib turibdi.
- [ ] Teskarisi: Sozlamalarda o'zgartiring → rail darhol yangilanadi (sahifa yangilamasdan).
- [ ] Ikkala mavzuda (yorug'/qorong'i) rail footer o'qiladi.

- [ ] **Step 5: Qo'lda tekshirish — mobil (375px) va admin portali**

- [ ] Mobil kenglikda rail ko'rinmaydi (`hidden lg:flex`), hech narsa buzilmagan.
- [ ] `/` (admin panel) ni ochib, sidebar'dagi eski `ThemeToggle` **hamon ishlayotganini** tasdiqlang — unga tegilmagan.
- [ ] `/login` sahifasidagi mavzu tugmasi ham ishlaydi.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/lumio/side-rail.tsx
git commit -m "feat(portal): unify the theme control — rail uses ThemeSegmented"
```

---

## Task 3: `Section` primitivi, `Screen narrow` va `StackHeader` orqaga tugmasi

**Files:**
- Create: `client/src/components/student-portal/lumio/section.tsx`
- Modify: `client/src/components/student-portal/lumio/screen.tsx`
- Modify: `client/src/components/student-portal/lumio/index.ts`

**Interfaces:**
- Consumes: `cn` (`@/lib/utils`)
- Produces:
  - `Section({ title?: string, children: React.ReactNode, className?: string })`
  - `ScreenProps` — `Screen` ga `narrow?: boolean`
  - Barrel eksportlari: `Section`, `SectionProps`, `ScreenProps`

- [ ] **Step 1: `Section` komponentini yaratish**

Yangi fayl `client/src/components/student-portal/lumio/section.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps {
  /** Caps eyebrow above the group, e.g. "Mavzu". Omit for an unlabelled group. */
  title?: string;
  children: React.ReactNode;
  className?: string;
}

// A labelled group of rows or cards. The caps eyebrow is the web twin of the
// student-app's `<Text variant="caps">` section header, so a settings screen
// reads as grouped settings instead of a flat stack of unrelated cards.
export function Section({ title, children, className }: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      {title ? (
        <h2 className="px-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
```

Yorliq CSS bilan katta harfga o'tkaziladi, shuning uchun chaqiruvda oddiy yozuv beriladi (`title="Mavzu"`, `"MAVZU"` emas).

- [ ] **Step 2: `Screen` ga `narrow` prop qo'shish**

`client/src/components/student-portal/lumio/screen.tsx` — `Screen` ta'rifini shunga almashtiring:

```tsx
export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Caps the column at a comfortable reading width on desktop. The shell gives
   * every screen up to 980px; text-and-rows screens (Settings, Profile) look
   * stretched at that width, so they opt into a narrower column.
   */
  narrow?: boolean;
}

// Vertical page container — stacks sections with the Lumio gap.
export function Screen({
  className,
  narrow = false,
  children,
  ...rest
}: ScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        narrow && "lg:max-w-[600px]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `StackHeader` orqaga tugmasini desktopda yashirish**

Xuddi shu fayldagi `StackHeader` ichidagi `<button>` ning `className` iga `lg:hidden` qo'shing:

```diff
-        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm transition-colors hover:bg-tint"
+        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm transition-colors hover:bg-tint lg:hidden"
```

Sabab: desktopda navigatsiyani rail bajaradi va `/portal/more` sahifasi rail'da umuman yo'q — orqaga tugmasi foydalanuvchini hech qachon ko'rmagan ekranga tashlar edi (audit U3).

- [ ] **Step 4: Barrel eksporti**

`client/src/components/student-portal/lumio/index.ts`:

```diff
-export { Screen, ScreenHeader, StackHeader } from "./screen";
+export { Screen, ScreenHeader, StackHeader, type ScreenProps } from "./screen";
+export { Section, type SectionProps } from "./section";
```

- [ ] **Step 5: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz. `narrow` ixtiyoriy bo'lgani uchun mavjud `<Screen>` chaqiruvlari o'zgarishsiz kompilyatsiya bo'ladi.

- [ ] **Step 6: Qo'lda tekshirish**

`Section` va `narrow` hali hech qayerda ishlatilmaydi, shuning uchun faqat regressiya tekshiriladi:

- [ ] Desktopda (1440px) `/portal/attendance`, `/portal/faq`, `/portal/about`, `/portal/settings`, `/portal/profile` — sarlavha o'z joyida, **orqaga tugmasi endi ko'rinmaydi**.
- [ ] Mobilda (375px) xuddi shu sahifalarda orqaga tugmasi **ko'rinadi** va ishlaydi.
- [ ] `/portal`, `/portal/schedule`, `/portal/payments` (ular `ScreenHeader` ishlatadi, `StackHeader` emas) o'zgarmagan.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/lumio/section.tsx \
        client/src/components/student-portal/lumio/screen.tsx \
        client/src/components/student-portal/lumio/index.ts
git commit -m "feat(portal): add Section primitive, Screen narrow width, desktop-free back button"
```

---

## Task 4: Ism va parol oynalarini alohida fayllarga ajratish

**Files:**
- Create: `client/src/components/student-portal/student-name-dialog.tsx`
- Create: `client/src/components/student-portal/student-password-dialog.tsx`
- Modify: `client/src/components/student-portal/student-settings-page.tsx`

**Interfaces:**
- Consumes: `useStudentProfile()` (`./lib/queries`), `StudentProfile` (`./lib/types`), `api` (`@/lib/api`), `getErrorMessage` (`@/lib/get-error-message`), Lumio `Button` / `Input` / `Field`
- Produces:
  - `StudentNameDialog({ open: boolean, onOpenChange: (open: boolean) => void })`
  - `StudentPasswordDialog({ open: boolean, onOpenChange: (open: boolean) => void })`

Bu **toza refactor** — foydalanuvchi uchun hech narsa o'zgarmaydi. Sozlamalar sahifasi hali ikkala oynani ham o'zi ochadi; ular Task 5 va Task 6 da joyiga tarqaladi.

Muhim farq: ilgari `NameSection` oynani ochishdan **oldin** maydonlarni to'ldirar edi (`openDialog()`). Endi oyna tashqaridan boshqariladi, shuning uchun to'ldirish `open` `true` bo'lganda `useEffect` orqali bajariladi.

- [ ] **Step 1: `StudentNameDialog` yaratish**

Yangi fayl `client/src/components/student-portal/student-name-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Input, Field } from "./lumio";
import { useStudentProfile } from "./lib/queries";
import type { StudentProfile } from "./lib/types";

export interface StudentNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Edit first/last name. Controlled from the screen that owns the name it edits
// (Profile). The mutation writes straight into the shared profile cache, so the
// rail, the More hub and the Profile heading all update from one write.
export function StudentNameDialog({
  open,
  onOpenChange,
}: StudentNameDialogProps) {
  const { data: profile } = useStudentProfile();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Seed the fields each time the dialog opens so a cancelled edit never leaves
  // stale text behind for the next one.
  useEffect(() => {
    if (!open) return;
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
  }, [open, profile?.firstName, profile?.lastName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      const res = await api.patch("/student-portal/name", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      queryClient.setQueryData<StudentProfile>(
        ["student-portal", "profile"],
        (old) =>
          old
            ? {
                ...old,
                firstName: res.data.firstName,
                lastName: res.data.lastName,
              }
            : old,
      );
      toast.success("Ism va familya yangilandi");
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            Ism va familya
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Ism">
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ismingiz"
              minLength={2}
              required
            />
          </Field>
          <Field label="Familya">
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Familyangiz"
              minLength={2}
              required
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Bekor qilish
            </Button>
            <Button type="submit" loading={loading}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `StudentPasswordDialog` yaratish**

Yangi fayl `client/src/components/student-portal/student-password-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Input, Field } from "./lumio";

export interface StudentPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Change password. Both fields are wiped whenever the dialog closes — on
// cancel, on success, and on an outside click — so a half-typed old password is
// never left sitting in state.
export function StudentPasswordDialog({
  open,
  onOpenChange,
}: StudentPasswordDialogProps) {
  const [loading, setLoading] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOldPassword("");
      setNewPassword("");
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    setLoading(true);
    try {
      await api.patch("/student-portal/password", { oldPassword, newPassword });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
      handleOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Parolni o'zgartirishda xatolik"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            Parolni o&apos;zgartirish
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Joriy parol">
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Joriy parolingiz"
              required
            />
          </Field>
          <Field label="Yangi parol">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kamida 6 ta belgi"
              minLength={6}
              required
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Bekor qilish
            </Button>
            <Button type="submit" loading={loading}>
              Saqlash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Sozlamalar sahifasini yangi oynalarga ulash**

`client/src/components/student-portal/student-settings-page.tsx` — `NameSection` va `PasswordSection` funksiyalarini butunlay o'chiring va ularning o'rniga tashqaridan boshqariladigan qatorlarni qo'ying. Faylning yuqorisidagi importlardan `Dialog*`, `Input`, `Field` olib tashlanadi (endi ular dialog fayllarida).

Fayl shu holatga keladi (Mavzu va Rasm bo'limlari **hali o'z joyida** — ular Task 6 da olib tashlanadi):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Camera,
  CircleNotch,
  IdentificationCard,
  Key,
  Sun,
  Moon,
  Desktop,
} from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Card,
  Button,
  Avatar,
  ListRow,
  SegmentedControl,
} from "./lumio";
import { StudentNameDialog } from "./student-name-dialog";
import { StudentPasswordDialog } from "./student-password-dialog";
import { useStudentProfile } from "./lib/queries";
import type { StudentProfile } from "./lib/types";

type ThemeMode = "system" | "light" | "dark";

const THEME_OPTIONS = [
  { value: "system" as const, label: "Tizim", icon: <Desktop size={16} weight="bold" /> },
  { value: "light" as const, label: "Yorug'", icon: <Sun size={16} weight="bold" /> },
  { value: "dark" as const, label: "Qorong'i", icon: <Moon size={16} weight="bold" /> },
];

export function StudentSettingsPage() {
  const { data: profile } = useStudentProfile();
  const [nameOpen, setNameOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <Screen>
      <StackHeader title="Sozlamalar" backHref="/portal/more" />
      <ThemeSection />
      <PhotoSection />

      <ListRow
        icon={<IdentificationCard weight="bold" />}
        iconTone="sky"
        label="Ism va familya"
        subtitle={`${profile?.firstName ?? "—"} ${profile?.lastName ?? ""}`.trim()}
        onClick={() => setNameOpen(true)}
      />
      <StudentNameDialog open={nameOpen} onOpenChange={setNameOpen} />

      <ListRow
        icon={<Key weight="bold" />}
        iconTone="amber"
        label="Parolni o'zgartirish"
        subtitle="Login va parol sozlamalari"
        onClick={() => setPasswordOpen(true)}
      />
      <StudentPasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </Screen>
  );
}
```

`ThemeSection` va `PhotoSection` funksiyalarini fayl oxirida **o'zgarishsiz qoldiring**.

- [ ] **Step 4: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz. Agar «`Dialog` is declared but never read» kabi ogohlantirish chiqsa — ishlatilmay qolgan importni o'chiring.

- [ ] **Step 5: Qo'lda tekshirish — xatti-harakat o'zgarmagani**

`/portal/settings` da:

- [ ] «Ism va familya» qatorini bosing → oyna maydonlari **joriy ism bilan to'ldirilgan** holda ochiladi.
- [ ] Ismni o'zgartirib saqlang → «Ism va familya yangilandi» toast'i, oyna yopiladi, qatordagi subtitle yangilanadi.
- [ ] Oynani qayta oching → maydonlarda **yangi** ism turibdi (eski qiymat qolib ketmagan).
- [ ] Oynani ochib, matnni o'zgartirib, «Bekor qilish» bosing → qayta ochganda saqlangan qiymat ko'rinadi, tahrir qilingan matn emas.
- [ ] «Parolni o'zgartirish» → noto'g'ri joriy parol bilan → xato toast'i, oyna ochiq qoladi.
- [ ] To'g'ri parol bilan → muvaffaqiyat toast'i, oyna yopiladi. Qayta oching → **ikkala maydon bo'sh**.
- [ ] Oynani tashqarisiga bosib yoping → qayta ochganda maydonlar bo'sh.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/student-name-dialog.tsx \
        client/src/components/student-portal/student-password-dialog.tsx \
        client/src/components/student-portal/student-settings-page.tsx
git commit -m "refactor(portal): extract name and password dialogs into their own files"
```

---

## Task 5: Profil sahifasiga ism tahririni qo'shish

**Files:**
- Modify: `client/src/components/student-portal/student-profile-page.tsx`

**Interfaces:**
- Consumes: Task 4 dan `StudentNameDialog`; Task 3 dan `Screen narrow`
- Produces: Profil ekranida ism tahriri — Task 6 dan keyin bu yagona joy bo'lib qoladi

Bu task **Task 6 dan oldin** bajarilishi shart: Sozlamalardan ism tahriri olib tashlanishidan avval Profilda paydo bo'lishi kerak, aks holda oraliq commit'da imkoniyat yo'qoladi.

- [ ] **Step 1: Importlarni yangilash**

`client/src/components/student-portal/student-profile-page.tsx` yuqorisida:

```diff
-import { Camera, CircleNotch, Trash } from "@phosphor-icons/react";
+import { Camera, CircleNotch, PencilSimple, Trash } from "@phosphor-icons/react";
 import { Screen, StackHeader, Card, Avatar, LoadingCards } from "./lumio";
+import { StudentNameDialog } from "./student-name-dialog";
```

- [ ] **Step 2: Oyna holatini qo'shish**

`StudentProfilePage` ichida, mavjud `const [busy, setBusy] = useState(false);` dan keyin:

```tsx
  const [nameOpen, setNameOpen] = useState(false);
```

- [ ] **Step 3: Ism sarlavhasini tahrir tugmasi bilan almashtirish**

Mavjud blokni:

```tsx
          <h2 className="font-display text-[22px] font-extrabold text-ink-900">
            {name}
          </h2>
```

shunga almashtiring:

```tsx
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[22px] font-extrabold text-ink-900">
              {name}
            </h2>
            <button
              type="button"
              onClick={() => setNameOpen(true)}
              aria-label="Ism va familyani o'zgartirish"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
            >
              <PencilSimple size={15} weight="bold" />
            </button>
          </div>
```

- [ ] **Step 4: Oynani render qilish**

Yakuniy `</Screen>` dan oldin, `) : null}` dan keyin:

```tsx
      <StudentNameDialog open={nameOpen} onOpenChange={setNameOpen} />
```

- [ ] **Step 5: Ikkala `Screen` ni `narrow` qilish**

Faylda ikkita `<Screen>` bor — yuklanish holati va asosiy holat. Ikkalasini ham `<Screen narrow>` ga o'zgartiring.

- [ ] **Step 6: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

- [ ] **Step 7: Qo'lda tekshirish**

`/portal/profile` da:

- [ ] Ism yonida qalam tugmasi ko'rinadi va ism bilan bir qatorda tekislangan.
- [ ] Bosilganda ism oynasi joriy qiymatlar bilan ochiladi.
- [ ] Saqlaganda: **Profil sarlavhasi**, **desktop rail'dagi ism** va **«Ko'proq» dagi ism** — uchalasi ham bir vaqtda yangilanadi (bitta `["student-portal", "profile"]` keshi).
- [ ] Desktopda (1440px) karta endi 600px dan kengaymaydi va ekranga cho'zilib ketmaydi.
- [ ] Mobilda (375px) karta to'liq kenglikda, qalam tugmasi ism matnini siqib qo'ymaydi.
- [ ] Uzun ism bilan (masalan «Abdurahmonov Abdurahmon») qalam tugmasi joyida qoladi (`shrink-0`).
- [ ] Rasm yuklash va «Rasmni o'chirish» ilgarigidek ishlaydi.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/student-profile-page.tsx
git commit -m "feat(portal): edit name on the Profile screen where it is shown"
```

---

## Task 6: Sozlamalar sahifasini qayta qurish

**Files:**
- Modify: `client/src/components/student-portal/student-settings-page.tsx`

**Interfaces:**
- Consumes: Task 1 dan `ThemeSegmented`; Task 3 dan `Section`, `Screen narrow`; Task 4 dan `StudentPasswordDialog`
- Produces: yakuniy Sozlamalar ekrani — Mavzu / Xavfsizlik / Hisob

Bu task auditning **Q2**, **Q3** va **Q4** muammolarini yopadi.

- [ ] **Step 1: Faylni to'liq almashtirish**

`client/src/components/student-portal/student-settings-page.tsx` ning butun mazmunini shunga almashtiring:

```tsx
"use client";

import { useState } from "react";
import { Key, User } from "@phosphor-icons/react";
import {
  Screen,
  StackHeader,
  Section,
  Card,
  ListRow,
  ThemeSegmented,
} from "./lumio";
import { StudentPasswordDialog } from "./student-password-dialog";
import { useStudentProfile } from "./lib/queries";

// Settings answers "how does the app behave" — theme and security. Everything
// that describes *who the student is* (photo, name, contact details) lives on
// the Profile screen, which this page links to. One field, one place to edit
// it: the photo uploader and the name row that used to sit here are gone.
export function StudentSettingsPage() {
  const { data: profile } = useStudentProfile();
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <Screen narrow>
      <StackHeader title="Sozlamalar" backHref="/portal/more" />

      <Section title="Mavzu">
        <Card pad="sm">
          <ThemeSegmented variant="full" />
        </Card>
      </Section>

      <Section title="Xavfsizlik">
        <ListRow
          icon={<Key weight="bold" />}
          iconTone="amber"
          label="Parolni o'zgartirish"
          subtitle={
            profile?.login
              ? `Login: ${profile.login}`
              : "Hisobingizni himoyalang"
          }
          onClick={() => setPasswordOpen(true)}
        />
      </Section>

      <Section title="Hisob">
        <ListRow
          icon={<User weight="bold" />}
          iconTone="sky"
          label="Profil"
          subtitle="Ism, rasm va aloqa ma'lumotlari"
          href="/portal/profile"
        />
      </Section>

      <StudentPasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </Screen>
  );
}
```

Fayl 330 qatordan ~65 qatorga qisqaradi. `ThemeSection`, `PhotoSection`, `NameSection`, `PasswordSection` — barchasi yo'qoladi: mavzu `ThemeSegmented` ga, rasm Profilga, ism Profilga, parol o'z dialog fayliga ko'chdi.

- [ ] **Step 2: Tiplar va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint
```

Kutilgan: ikkalasi ham xatosiz. `api`, `toast`, `useQueryClient`, `Avatar`, `Camera`, `Button` importlari endi kerak emas — ular yuqoridagi kodda umuman yo'q.

- [ ] **Step 3: Ishlatilmay qolgan kod qolmaganini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client
grep -n "PhotoSection\|NameSection\|PasswordSection\|ThemeSection\|THEME_OPTIONS" src/components/student-portal/student-settings-page.tsx
```

Kutilgan: **hech qanday natija yo'q**. Chiqsa — eski funksiyalar o'chirilmagan.

- [ ] **Step 4: Qo'lda tekshirish — tuzilma**

`/portal/settings` da:

- [ ] Uchta bo'lim ko'rinadi, har birining ustida kichik katta-harfli yorliq: MAVZU, XAVFSIZLIK, HISOB.
- [ ] Mavzu tanlagichi karta ichida, uch variant yorlig'i bilan.
- [ ] «Parolni o'zgartirish» qatorining subtitle'i **haqiqiy loginni** ko'rsatadi (`Login: <login>`).
- [ ] Login `null` bo'lgan o'quvchida subtitle «Hisobingizni himoyalang» bo'ladi. (Tekshirish uchun dev bazasida `login` i yo'q o'quvchi bilan kiring yoki React DevTools'da `profile.login` ni vaqtincha `null` qiling.)
- [ ] «Profil» qatori `/portal/profile` ga olib boradi.
- [ ] Rasm yuklash bloki va «Ism va familya» qatori sahifada **yo'q**.

- [ ] **Step 5: Qo'lda tekshirish — funksional**

- [ ] Mavzu tanlash ishlaydi va rail bilan sinxron (Task 2 dagidek).
- [ ] Parol o'zgartirish oynasi ochiladi, ishlaydi, yopilganda maydonlar tozalanadi.
- [ ] Desktopda (1440px) ustun 600px dan kengaymaydi, orqaga tugmasi ko'rinmaydi.
- [ ] Mobilda (375px) orqaga tugmasi ko'rinadi va `/portal/more` ga qaytaradi.
- [ ] Yorug' va qorong'i mavzuda bo'lim yorliqlari o'qiladi (`text-ink-500`).

- [ ] **Step 6: Qo'lda tekshirish — hech narsa yo'qolmagani**

Faza 1 dan oldin mavjud bo'lgan har bir imkoniyat hamon mavjudligini tasdiqlang:

| Imkoniyat | Endi qayerda |
|---|---|
| Mavzu tanlash | Sozlamalar + rail |
| Rasm yuklash | Profil (avatarni bosish) |
| Rasm o'chirish | Profil («Rasmni o'chirish») |
| Ism o'zgartirish | Profil (qalam tugmasi) |
| Parol o'zgartirish | Sozlamalar |

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/student-portal/student-settings-page.tsx
git commit -m "feat(portal): rebuild Settings as theme + security, move identity to Profile"
```

---

## Task 7: Hujjatlarni yangilash va yakuniy tekshiruv

**Files:**
- Modify: `client/CLAUDE.md:689-712` (Student Portal bo'limi)
- Modify: `docs/student-portal-ux-audit.md` (Faza 1 holatini yangilash)

**Interfaces:**
- Consumes: Task 1–6 natijalari
- Produces: kod bilan mos hujjat

- [ ] **Step 1: `client/CLAUDE.md` da Lumio primitivlari ro'yxatini yangilash**

694-qatordagi primitivlar ro'yxatiga `Section` va `ThemeSegmented` qo'shing:

```diff
-- Self-contained primitive library (barrel: `lumio/index.ts`) mirroring the student-app's design components: `Button`, `Card`, `FeatureCard`, `IconTile`, `ListRow`, `Badge`, `StatChip`, `Avatar`, `ProgressBar`, `ProgressRing`, `SegmentedControl`, `EmptyState`, `Screen`/`ScreenHeader`/`StackHeader`, `FadeIn`, `Skeleton`, `Input`/`Field`, `BottomSheet`.
+- Self-contained primitive library (barrel: `lumio/index.ts`) mirroring the student-app's design components: `Button`, `Card`, `FeatureCard`, `IconTile`, `ListRow`, `Badge`, `StatChip`, `Avatar`, `ProgressBar`, `ProgressRing`, `SegmentedControl`, `Section`, `ThemeSegmented`, `EmptyState`, `Screen`/`ScreenHeader`/`StackHeader`, `FadeIn`, `Skeleton`, `Input`/`Field`, `BottomSheet`.
```

- [ ] **Step 2: Mavzu boshqaruvi qoidasini yozib qo'yish**

Xuddi shu ro'yxatdan keyin yangi punkt qo'shing:

```markdown
- **Theme control:** the portal uses `ThemeSegmented` in **both** places — labelled (`variant="full"`) on `/portal/settings`, icon-only (`variant="compact"`) in the desktop rail footer. Do not put the admin `components/theme-toggle.tsx` (lucide, cycle-through) inside `/portal/*`: one state with two interaction models is what this replaced. `theme-toggle.tsx` itself stays — the admin panel, the teacher portal, `/login`, `error.tsx` and `not-found.tsx` all use it.
```

- [ ] **Step 3: Ekran komponentlari ro'yxatini yangilash**

`student-profile-page.tsx` / `student-settings-page.tsx` qatorini almashtiring:

```diff
-- `student-profile-page.tsx` / `student-settings-page.tsx` — profile + password settings
+- `student-profile-page.tsx` — identity: photo, name (editable in place), read-only contact rows
+- `student-settings-page.tsx` — app behaviour: theme + security, and a link across to Profile
+- `student-name-dialog.tsx` / `student-password-dialog.tsx` — controlled (`open` / `onOpenChange`) edit dialogs
```

- [ ] **Step 4: Chegara qoidasini yozib qo'yish**

Ekran ro'yxatidan keyin:

```markdown
**Profile vs Settings:** Profile = *who the student is* (photo, name, phone, login, telegram, branch). Settings = *how the app behaves* (theme, password). Every field is editable in exactly one place — do not add a second entry point for the same field.
```

- [ ] **Step 5: Auditda Faza 1 holatini yangilash**

`docs/student-portal-ux-audit.md` — 8-bo'limdagi jadvalda Faza 1 qatorining holatini `spec yozilgan` dan `BAJARILDI — <sana>` ga o'zgartiring.

- [ ] **Step 6: Yakuniy tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run lint && npm run build
```

Kutilgan: uchalasi ham xatosiz. `npm run build` bu yerda birinchi marta ishlatiladi — u SSR/prerender bosqichida `useTheme` bilan bog'liq hidratsiya muammolarini oshkor qiladi.

Agar `npm run build` yiqilsa, avval sabab shu ishdan ekanini tasdiqlang. **`git stash` ishlatmang** — bu repoda ishchi daraxtda commit qilinmagan boshqa o'zgarishlar bor (`client/CLAUDE.md`, `docs/README.md`, `docs/branch-decisions.md`, `server/CLAUDE.md`), stash ularni ham olib ketadi. Buning o'rniga alohida worktree'da tekshiring:

```bash
cd /Users/a1111/Desktop/daf-erp-system
git worktree add /tmp/daf-build-baseline main
cd /tmp/daf-build-baseline/client && npm ci && npm run build
# tekshirib bo'lgach:
cd /Users/a1111/Desktop/daf-erp-system && git worktree remove /tmp/daf-build-baseline
```

`main` da ham yiqilsa — bu oldindan mavjud muammo, uni alohida hal qiling va bu PR'ga qo'shmang.

- [ ] **Step 7: To'liq regressiya o'tishi**

Har bir portal sahifasini oching va konsolda xato yo'qligini tasdiqlang:

- [ ] `/portal` — Asosiy
- [ ] `/portal/schedule` — Jadval
- [ ] `/portal/ai` — AI
- [ ] `/portal/payments` — To'lovlar
- [ ] `/portal/more` — Ko'proq
- [ ] `/portal/attendance` — Davomat
- [ ] `/portal/settings` — Sozlamalar
- [ ] `/portal/profile` — Profil
- [ ] `/portal/faq` — FAQ
- [ ] `/portal/about` — Biz haqimizda

Har birida: mobil (375px) va desktop (1440px), yorug' va qorong'i.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/CLAUDE.md docs/student-portal-ux-audit.md
git commit -m "docs(portal): record the Profile/Settings boundary and the unified theme control"
```

- [ ] **Step 9: PR ochish**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git push -u origin feat/portal-settings-profile-rework
gh pr create --title "O'quvchi portali: Sozlamalar va Profil qayta qurildi (Faza 1)" --body "$(cat <<'BODY'
## Nima o'zgardi

- **Mavzu boshqaruvi birlashtirildi.** Desktop rail'dagi admin `ThemeToggle` (lucide, aylanma) o'rniga portalning o'z `ThemeSegmented` i turadi — Sozlamalardagi bilan bir xil komponent, bir xil model.
- **Sozlamalar = «ilova qanday ishlaydi».** Uch bo'lim: Mavzu, Xavfsizlik, Hisob. Parol qatori endi haqiqiy loginni ko'rsatadi.
- **Profil = «men kimman».** Ism endi ko'rinadigan joyida — Profilda tahrirlanadi. Rasm tahririning Sozlamalardagi nusxasi olib tashlandi.
- Yangi Lumio primitivlari: `Section` (bo'lim yorlig'i), `ThemeSegmented`, `SegmentedControl` ning `compact` rejimi, `Screen narrow`.
- `StackHeader` orqaga tugmasi desktopda yashiriladi — u yerda navigatsiyani rail bajaradi.

## Nima o'zgarmadi

- Backend, API, ma'lumot modeli — teginilmagan.
- `components/theme-toggle.tsx` — admin panel, o'qituvchi portali, `/login`, `error.tsx`, `not-found.tsx` uni ishlatishda davom etadi.

## Hujjatlar

- Spec: `docs/superpowers/specs/2026-08-19-student-portal-settings-profile-design.md`
- Butun portal auditi va qolgan fazalar: `docs/student-portal-ux-audit.md`

## Tekshirildi

`npx tsc --noEmit`, `npm run lint`, `npm run build` — toza. Barcha 10 portal sahifasi mobil/desktop × yorug'/qorong'i da qo'lda ko'rildi. Lokal backend (urug'langan dev bazasi) bilan sinaldi — prod bilan emas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Yakuniy holat: fayllar xaritasi

| Fayl | Mas'uliyat |
|---|---|
| `lumio/theme-segmented.tsx` | Mavzu tanlovining yagona manbasi (variantlar ro'yxati + `next-themes` bog'lanishi) |
| `lumio/section.tsx` | Yorliqli guruh — sozlamalar ekranining ritmi |
| `lumio/segmented-control.tsx` | Umumiy pill tanlagich; `compact` — icon-only rejim |
| `lumio/screen.tsx` | Sahifa konteyneri (`narrow`) va sarlavhalar (`StackHeader` desktopda orqaga tugmasiz) |
| `lumio/side-rail.tsx` | Desktop navigatsiya; footer'da mavzu + chiqish |
| `student-settings-page.tsx` | Ilova xatti-harakati: mavzu, xavfsizlik, Profilga ko'prik |
| `student-profile-page.tsx` | Shaxs: rasm, ism (tahrirlanadi), aloqa ma'lumotlari (faqat ko'rish) |
| `student-name-dialog.tsx` | Ism/familya tahriri — boshqariladigan oyna |
| `student-password-dialog.tsx` | Parol o'zgartirish — boshqariladigan oyna |

## Faza 1 dan keyin

Audit (`docs/student-portal-ux-audit.md`, 8-bo'lim) qolgan beshta fazani sanaydi. Keyingisi — **Faza 2**: portal modallarini Lumio `BottomSheet` ga o'tkazish (U1), xato holatlarini qo'shish (U4), desktop kengligini qolgan sahifalarga tarqatish (U2), `backHref` ni to'g'rilash (U3), `staleTime` (U5).
