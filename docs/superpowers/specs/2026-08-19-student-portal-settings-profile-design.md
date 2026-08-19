# O'quvchi portali — Sozlamalar va Profil qayta qurilishi (Faza 1)

**Sana:** 2026-08-19
**Holat:** dizayn tasdiqlangan, implementatsiya kutmoqda
**Audit:** `docs/student-portal-ux-audit.md` (Faza 1 = Q1–Q4)
**Backend o'zgarishi:** yo'q

---

## 1. Muammo

`/portal/settings` sahifasi to'rtta bog'lanmagan blokdan iborat va uning ikkitasi
`/portal/profile` bilan ustma-ust tushadi. Mavzu (dark/light) esa desktopda
ikkita butunlay boshqacha ko'rinishdagi boshqaruv orqali o'zgaradi.

Batafsil isbot: `docs/student-portal-ux-audit.md` → «Faza 1» bo'limi (Q1–Q4).

Qisqacha:

- **Q1** — mavzu: rail'da aylanma `ThemeToggle` (lucide, admin token'lari),
  Sozlamalarda 3 variantli `SegmentedControl` (Phosphor, Lumio). Bitta holat,
  ikki model.
- **Q2** — Sozlamalarda bo'lim sarlavhalari yo'q, uch xil idiom aralashgan.
- **Q3** — rasm ikkala sahifada yuklanadi, o'chirish faqat Profilda, ism faqat
  Sozlamalarda tahrirlanadi.
- **Q4** — parol qatorining subtitle'i («Login va parol sozlamalari») yolg'on.

## 2. Prinsip

> **Profil = men kimman.** Rasm, ism, aloqa ma'lumotlari — ko'rinadigan joyda
> tahrirlanadi.
>
> **Sozlamalar = ilova qanday ishlaydi.** Mavzu va xavfsizlik.

Har bir maydon **faqat bitta** joyda tahrirlanadi.

## 3. Yakuniy tuzilma

### Sozlamalar (`/portal/settings`)

```
‹ Sozlamalar

MAVZU
┌────────────────────────────────────┐
│ [ ▣ Tizim │ ☀ Yorug' │ ☾ Qorong'i ] │
└────────────────────────────────────┘

XAVFSIZLIK
┌────────────────────────────────────┐
│ 🔑  Parolni o'zgartirish         ›  │
│     Login: ali01                    │
└────────────────────────────────────┘

HISOB
┌────────────────────────────────────┐
│ 👤  Profil                       ›  │
│     Ism, rasm va aloqa ma'lumotlari │
└────────────────────────────────────┘
```

- Parol qatorining subtitle'i endi **haqiqiy loginni** ko'rsatadi
  (`profile.login`) — Q4 hal bo'ladi. Login yuklanmagan bo'lsa subtitle
  «Hisobingizni himoyalang». Sahifa shuning uchun `useStudentProfile()` ni
  o'qishda davom etadi (rasm yuklash mantiqi olib tashlansa ham).
- «HISOB → Profil» qatori ataylab qo'shiladi: ilgari ismni Sozlamalarda
  o'zgartirgan foydalanuvchi adashib qolmasligi uchun ko'prik.

Elementlar:

| Bo'lim | Ichidagi element |
|---|---|
| MAVZU | `Card pad="sm"` ichida `ThemeSegmented variant="full"` — segmented o'z `bg-sunk` yo'lagi bilan sirt ustida turadi, sahifa foni ustida emas |
| XAVFSIZLIK | `ListRow` — ikonka `Key`, `iconTone="amber"` (hozirgidek), `onClick` → parol oynasi |
| HISOB | `ListRow` — ikonka `User` (`lumio/icon` da mavjud), `iconTone="sky"`, `href="/portal/profile"` |

### Profil (`/portal/profile`)

```
‹ Profil
┌────────────────────────────────────┐
│           (avatar 96) 📷            │
│         Ali Valiyev    ✏️           │
│         Rasmni o'chirish            │
│ ────────────────────────────────── │
│ Telefon      +998 90 123 45 67      │
│ Login        ali01                  │
│ Telegram     @ali                   │
│ Filial       Farg'ona               │
└────────────────────────────────────┘
```

- 📷 — mavjud xatti-harakat (avatarni bosish → fayl tanlash).
- ✏️ — **yangi**: ism yonidagi ikonka tugma (`PencilSimple`, `size-8`,
  `rounded-full border border-line`, `aria-label="Ism va familyani o'zgartirish"`),
  bosilganda ism oynasini ochadi. Oyna Sozlamalardan ko'chib keladi.
- «Rasmni o'chirish» — mavjud, faqat rasm bor bo'lganda ko'rinadi.
- Info qatorlari o'zgarishsiz, faqat ko'rish uchun.

## 4. Mavzu — bitta komponent, ikki variant

```
RAIL FOOTER (compact)              SOZLAMALAR (full)
┌────────────────────────┐         ┌────────────────────────────────┐
│ [ ▣ │ ☀ │ ☾ ]     ⏻   │         │ [ ▣ Tizim │ ☀ Yorug' │ ☾ Qorong'i ]│
└────────────────────────┘         └────────────────────────────────┘
  icon-only, h-8                     matnli, h-10
  aria-label saqlanadi               bir xil uslub, bir xil model
```

### `ThemeSegmented` — yangi komponent

Fayl: `client/src/components/student-portal/lumio/theme-segmented.tsx`

```ts
interface ThemeSegmentedProps {
  /** "full" — matnli (Sozlamalar), "compact" — icon-only (rail). */
  variant?: "full" | "compact";
  className?: string;
}
```

Ichida:

- `useTheme()` (`next-themes`) — `theme`, `setTheme`.
- `mounted` guard (SSR/hidratsiya nomuvofiqligining oldini oladi). Mount
  bo'lmaguncha o'lchami mos placeholder ko'rsatiladi — `full` uchun `h-[52px]`,
  `compact` uchun `h-[44px]`, ikkalasi ham `rounded-pill bg-sunk`.
- `SegmentedControl` ustiga quriladi, variantlar: `system` / `light` / `dark`,
  yorliqlari «Tizim» / «Yorug'» / «Qorong'i», ikonkalari `Desktop` / `Sun` /
  `Moon` (Phosphor).

Mavzu variantlari ro'yxati shu faylda **yagona manba** bo'ladi — hozir u
`student-settings-page.tsx` ichida `THEME_OPTIONS` sifatida yotibdi.

### `SegmentedControl` — `compact` prop

Fayl: `lumio/segmented-control.tsx`

```ts
interface SegmentedControlProps<T extends string> {
  // ...mavjudlari
  /** Yorliqni yashiradi, faqat ikonka qoladi. Yorliq aria-label bo'lib ketadi. */
  compact?: boolean;
}
```

- `compact` bo'lganda tugma balandligi `h-10` → `h-8`, `gap-1.5` → `gap-0`,
  matn `sr-only` emas, balki umuman render qilinmaydi, o'rniga tugmaga
  `aria-label={o.label}` beriladi.
- Sirpanuvchi indikator geometriyasi o'zgarmaydi (`p-1.5` track, `+6px` /
  `-12px` hisoblari).
- Mavjud chaqiruvlar (`compact` berilmagan) hech qanday o'zgarishsiz ishlaydi.

### Rail

Fayl: `lumio/side-rail.tsx`

```diff
-import { ThemeToggle } from "@/components/theme-toggle";
+import { ThemeSegmented } from "./theme-segmented";
...
-        <ThemeToggle />
+        <ThemeSegmented variant="compact" className="min-w-0 flex-1" />
```

Footer hozirgidek `flex items-center justify-between gap-2` bo'lib qoladi;
chapda segmented, o'ngda `LogoutButton variant="rail"`.

**`ThemeToggle` o'chirilmaydi** — u portaldan tashqarida oltita joyda ishlatiladi:
`app-sidebar.tsx`, `dashboard-header.tsx`, `(auth)/login/page.tsx` (3 marta),
`error.tsx`, `not-found.tsx`.

## 5. Bo'lim sarlavhasi — `Section`

Fayl: `lumio/section.tsx` (yangi)

```ts
interface SectionProps {
  /** Caps yorliq — masalan "MAVZU". */
  title?: string;
  children: React.ReactNode;
  className?: string;
}
```

Render: `<h2>` caps uslubda (`text-[11px] font-extrabold uppercase
tracking-[0.08em] text-ink-500 px-1`) + `flex flex-col gap-2.5` konteyner.
Native ilovadagi `<Text variant="caps">` ning web ekvivalenti — Q2 shu bilan hal
bo'ladi. Keyingi fazalarda boshqa sahifalarda ham ishlatiladi.

## 6. Desktop kengligi va orqaga tugmasi

Fayl: `lumio/screen.tsx`

- `Screen` ga `narrow?: boolean` prop qo'shiladi → `lg:max-w-[600px]`.
  Sozlamalar va Profil shu bilan o'raladi. (Audit U2 ning shu ikki sahifadagi
  ulushi.)
- `StackHeader` ning orqaga tugmasiga `lg:hidden` qo'shiladi — desktopda
  navigatsiyani rail bajaradi, `/portal/more` ga qaytarish mantiqsiz edi.
  Sarlavha o'z joyida qoladi. (Audit U3 ning shu ulushi.)

Ikkala o'zgarish ham qo'shimcha (opt-in / faqat `lg`), shuning uchun boshqa
sahifalarga ta'sir qilmaydi.

## 7. Fayl o'zgarishlari

| Fayl | Amal |
|---|---|
| `lumio/theme-segmented.tsx` | **yangi** — `ThemeSegmented` |
| `lumio/section.tsx` | **yangi** — `Section` |
| `lumio/segmented-control.tsx` | `compact` prop |
| `lumio/screen.tsx` | `Screen` ga `narrow`; `StackHeader` orqaga tugmasi `lg:hidden` |
| `lumio/index.ts` | `ThemeSegmented`, `Section` eksporti |
| `lumio/side-rail.tsx` | `ThemeToggle` → `ThemeSegmented compact` |
| `student-settings-page.tsx` | qayta yoziladi: **330 → ~110 qator** |
| `student-profile-page.tsx` | ism tahriri tugmasi + dialog ulanishi |
| `student-name-dialog.tsx` | **yangi** — Sozlamalardan ko'chadi |
| `student-password-dialog.tsx` | **yangi** — Sozlamalardan ajraladi |

Ikkala dialog ham o'zining mutatsiyasini, `useState` holatini va
`queryClient.setQueryData` yangilanishini o'z ichiga oladi — hozirgi mantiq
o'zgarmaydi, faqat joyi o'zgaradi. Har biri `open` / `onOpenChange` propslarini
qabul qiladi, ochish tugmasi chaqiruvchi sahifada qoladi.

Backend o'zgarishi yo'q: `PATCH /student-portal/name`,
`PATCH /student-portal/password`, `POST /student-portal/photo`,
`DELETE /student-portal/photo` — hammasi mavjud
(`server/src/students/student-portal.controller.ts`).

## 8. Tekshirish

⚠️ **Prod backend bilan sinalmaydi.** Ism va parol o'zgartirish haqiqiy
o'quvchining yozuvini o'zgartiradi. Sinov uchun lokal server (`server/.env`,
urug'langan dev bazasi) ko'tariladi va klient unga qaytariladi.

Komponent render harnessi yo'q (`vitest` `environment: "node"`,
`include: ["src/**/*.test.ts"]`), shuning uchun avtomatik test yozilmaydi.

Tekshiruv ro'yxati:

1. `npm run lint` — toza.
2. `npx tsc --noEmit` — toza.
3. Brauzerda qo'lda, uch kenglik × ikki mavzu:
   - 375px (mobil), 768px (planshet), 1440px (desktop)
   - yorug' / qorong'i
4. Funksional:
   - Rail'dagi mavzu tanlovi Sozlamalardagi tanlov bilan **darhol** sinxron.
   - Sahifa yangilanganda tanlangan mavzu saqlanadi, hidratsiya sakrashi yo'q.
   - Ism o'zgartirish → Profil sarlavhasi, rail'dagi ism va «Ko'proq» dagi ism
     bir vaqtda yangilanadi (bitta `["student-portal", "profile"]` keshi).
   - Parol o'zgartirish → muvaffaqiyat toast'i, oyna yopiladi, maydonlar
     tozalanadi.
   - Sozlamalardagi «Profil» qatori Profil sahifasiga olib boradi.
   - Desktopda Sozlamalar/Profil sahifalarida orqaga tugmasi ko'rinmaydi;
     mobilda ko'rinadi va `/portal/more` ga qaytaradi.
5. Klaviatura: segmented control Tab bilan qo'lga olinadi, Enter/Space ishlaydi;
   `compact` variantda har tugmaning `aria-label`i o'qiladi.

## 9. Qamrovdan tashqari (ataylab)

| Nima | Nega |
|---|---|
| Bildirishnoma sozlamalari | Backend endpoint'i yo'q, saqlanadigan joy yo'q |
| Til almashtirish | Portalda i18n qatlami yo'q (`project_student_app_i18n` — native qatlami ham yo'qolgan) |
| «Tez orada» qatorlari (Til, Tarjimon) | Auditda Uzum Bank blokini o'lik piksel deb tanqid qilindi — bu yerda ham shunday bo'lardi |
| Modal'larni Lumio `BottomSheet` ga o'tkazish | Audit U1 — butun portalga tegishli, **Faza 2** |
| Akkaunt o'chirish | Talab qilinmagan, backend yo'q |
| Chiqish tugmasini Sozlamalarga qo'shish | U allaqachon ikki joyda (rail footer + «Ko'proq»); uchinchisi keraksiz |
