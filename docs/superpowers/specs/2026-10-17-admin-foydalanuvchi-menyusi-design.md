# Admin panel: foydalanuvchi menyusi yuqori panelda, sidebar pasti yordam va versiya uchun

Sana: 17.10.2026. Holat: dizayn tasdiqlandi (CEO: «A. Lekin eng to'g'ri joyga
qo'yishimiz kerak»; joylashuv tafsilotlari 17.10 da kelishildi).
Bu **4 bo'lakli ishning 1-bo'lagi**. Qolgan bo'laklar alohida spec va PR bo'ladi:

1. **Shu spec.** Foydalanuvchi menyusi yuqori panelga, sidebar pastiga yordam va versiya.
2. Dizayn variantlari (tayyor rang va shrift to'plamlari, «Ko'rinish»).
3. Til tizimi: O'zbek (lotin), O'zbek (kirill), Rus, Nemis, Ingliz.
4. Qolgan sahifalarni tarjima qilish.

2 va 3-bo'lak shu spec yaratgan menyuga o'z bandlarini qo'shadi.

## Muammo

`app-sidebar.tsx` ning eng pastida `SidebarUserFooter` turadi: rasm, ism, rol va
«Profil» / «Chiqish» menyusi. Sidebar yig'ilganda (faqat belgilar) bu blok
kichrayib qoladi, sidebar pastida esa sana, versiya yoki yordam uchun joy yo'q.
Dizayn variantlari va til tanlagichi keladigan bo'lsa, ular uchun ham
«foydalanuvchi sozlamalari» deb tanilgan joy kerak.

## Yechim

### 1. Foydalanuvchi bloki yuqori panelning o'ng chetida

Yangi komponent `components/header-user-menu.tsx`, `dashboard-header.tsx` da
o'ng guruhning oxirida, bildirishnoma qo'ng'irog'idan keyin:

- **Tugma:** rasm (`size-8`, rasm yo'q bo'lsa `getInitials` bosh harflari) va ism. Ism `lg` (1024px) dan kichik
  ekranda yashiriladi (telefon va planshetda faqat rasm: planshetda `md`–`lg` oralig'ida
  qidiruv uchun joy qolsin), uzun ism `truncate` + `max-w-40`. Tugmaning `aria-label` i —
  foydalanuvchining to'liq ismi.
- **Menyu** (`DropdownMenu`, `align="end"`, `w-64`):
  1. Sarlavha: to'liq ism va rol (`user.roles[0].name`), bosilmaydi.
  2. **Profil** → `/profile`.
  3. **Ko'rinish** (`DropdownMenuSub`): «Yorug'», «Qorong'i», «Tizim» —
     `DropdownMenuRadioGroup`, `next-themes` ning `useTheme()` ga ulangan.
     Faol rejim belgilanadi.
  4. Ajratgich.
  5. **Chiqish** (qizil, `useSignOut()` — Mini App qoidasi o'sha-o'sha, CLAUDE.md
     «Chiqish goes through useSignOut()»).
- 2 va 3-bo'lak shu menyuga «Dizayn» va «Til» bandlarini qo'shadi. Hozir ular yo'q.
- `onOpenChange` da `setOpenLock` kerak emas: menyu endi sidebar ichida emas
  (u sidebar ochiq turishini ushlab turish uchun edi).

### 2. Sidebarning pastki qismi

`SidebarUserFooter` o'chiriladi (fayl ham, `AppSidebar` dagi ishlatilishi ham).
O'rniga `components/sidebar-footer-info.tsx`:

- **Texnik yordam** — `COMPANY.supportHref` (`lib/company.ts`, kirish sahifasi
  footer'idagi o'sha havola) ga `target="_blank" rel="noopener noreferrer"`.
  Ikonka `LifeBuoy`. Yig'ilgan sidebar'da faqat ikonka + tooltip «Texnik yordam»
  (shadcn `SidebarMenuButton tooltip`). Nomi «Yordam» emas: yuqori panelda
  allaqachon «Shu sahifa bo'yicha qo'llanma» (`?` tugmasi) bor, ikki xil
  «yordam» aralashib ketmasin.
- **Versiya qatori:** `Yangilangan: 17.10.2026 · a1b2c3d` (sana Toshkent
  vaqtida, `dd.MM.yyyy`; kod — commitning 7 belgisi). Yig'ilgan sidebar'da
  yashiriladi (`group-data-[collapsible=icon]:hidden`). `text-xs
  text-muted-foreground`.
- **Telefon:** sidebar'ning mobil footeridagi «Mavzu» + `ThemeToggle` olib
  tashlanadi (mavzu endi foydalanuvchi menyusida). Yordam va versiya qatori
  mobil sidebar'da ham ko'rinadi.

### 3. Yuqori panel: sana va soat birga

`TashkentClock` hozir faqat `HH:mm:ss` ko'rsatadi. Endi `lg` (1024px) dan boshlab
`dd.MM.yyyy · HH:mm:ss`, `md`–`lg` oralig'ida (planshet) avvalgidek faqat `HH:mm:ss`
(sana qismi `hidden lg:inline` o'z `span` ida, ajratuvchi ` · ` bilan birga).
Sana `tashkentNow().dateStr` dan olinadi, `yyyy-MM-dd` → `dd.MM.yyyy`
formatlash helper'i `lib/tashkent-time.ts` ga qo'shiladi va test qilinadi.
Tooltip o'sha: «Toshkent vaqti (UTC+5)». `hidden md:flex` o'zgarmaydi (telefonda
soat yashirin).

### 4. `ThemeToggle` yuqori paneldan olib tashlanadi

`dashboard-header.tsx` dagi `ThemeToggle` (`hidden sm:block`) ketadi: mavzu
foydalanuvchi menyusidagi «Ko'rinish» da. `components/theme-toggle.tsx` faylining
o'zi qoladi — kirish sahifalari, `error.tsx`, `not-found.tsx` va o'quvchi
portali ishlatadi (CLAUDE.md «Theme control»).

### 5. Versiyani qayerdan olamiz

`package.json` dagi `version: "0.1.0"` hech qachon o'zgarmagan, shuning uchun
hech narsa bildirmaydi. O'rniga `next.config.ts` da build vaqtida ikki qiymat
`env` ga yoziladi:

- `NEXT_PUBLIC_BUILD_SHA` = `process.env.VERCEL_GIT_COMMIT_SHA` ning birinchi 7
  belgisi, yo'q bo'lsa (`npm run dev`, lokal build) `"dev"`.
- `NEXT_PUBLIC_BUILD_DATE` = config yuklangan paytdagi sana, Toshkent vaqtida
  `YYYY-MM-DD` (build vaqti).

`VERCEL_GIT_COMMIT_SHA` — Vercel o'zi beradigan tizim o'zgaruvchisi, uni
panelda qo'lda kiritish kerak emas (`NEXT_PUBLIC_*` ning `.env` dan olinmasligi
haqidagi ogohlantirish bu yerga tegishli emas: qiymat `next.config.ts` ichida
hisoblanadi). Lokal `dev` da sha `dev`, sana — bugun.

Formatlash va `"dev"` holati `lib/build-info.ts` da: `formatBuildInfo({ date,
sha })` → `"Yangilangan: 17.10.2026 · a1b2c3d"`; sha `dev` bo'lsa
`"Yangilangan: 17.10.2026 · dev"`.

## Tegilmaydigan narsalar

- Filial almashtirgich, qidiruv, bildirishnoma qo'ng'irog'i joyida qoladi.
- RBAC: menyu hamma rolga bir xil, hech narsa yashirilmaydi (Profil va Chiqish
  hammaga kerak). Backend o'zgarmaydi.
- `useSignOut()` mantig'i, `/profile` sahifasi o'zgarmaydi.
- O'quvchi portali (`student-portal/`) bu ishga kirmaydi: u o'z `side-rail`
  va `lumio` tizimida.

## Chekka holatlar

- `useAuth` da `user` hali yo'q (hydratsiya): menyu hech narsa chizmaydi
  (`SidebarUserFooter` dagi `if (!user) return null` kabi), joy sakramasligi
  uchun tugma o'lchamli skelet (`size-8` doira) ko'rsatiladi.
- Rasmi yo'q foydalanuvchi: bosh harflar (`AvatarFallback`), avvalgidek.
- Ism juda uzun: `truncate`, tugma kengligi cheklangan, panelning qolgan
  elementlari siqilmaydi.
- Sana `useEffect` ichida o'rnatiladi (SSR va klient mos kelsin): birinchi
  chizishda `--.--.---- · --:--:--`, `TashkentClock` ning hozirgi usuli.
- `VERCEL_GIT_COMMIT_SHA` bo'lmagan muhit (self-host, lokal): `dev`, xato yo'q.

## Test

- `lib/build-info.test.ts`: oddiy sha, `dev`, bo'sh/yo'q sha.
- `lib/tashkent-time.test.ts` ga: `yyyy-MM-dd` → `dd.MM.yyyy` helper'i (oy/yil
  chegaralari, nol bilan to'ldirish).
- `header-user-menu.test.tsx`: statik render — ism, rol, «Profil», «Chiqish»
  bor; `lg` dan kichik kenglikda ism yo'q (sinf tekshiruvi).
- `nav-items.test.ts` va sidebar bilan bog'liq mavjud testlar o'tishi kerak
  (sidebar `SidebarUserFooter` ni import qilmaydi).
- `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run build`.
- Brauzerda tekshirish: kompyuter, planshet, telefon (375px) kengliklari;
  sidebar ochiq va yig'ilgan; qorong'i rejim; Profil va Chiqish ishlaydi.

## ADR

Kerak emas: ma'lumot modeli, pul, filial qoidasi yoki tashqi xizmat tanlovi
o'zgarmaydi; qaytarish oson. `client/CLAUDE.md` ga qisqa band qo'shiladi
(foydalanuvchi menyusi yuqori panelda, mavzu shu yerda, sidebar pasti
yordam/versiya).
