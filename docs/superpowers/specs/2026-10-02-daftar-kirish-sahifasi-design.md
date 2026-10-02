# Xodimlar kirish sahifasi: «Daftar» dizayni

Sana: 02.10.2026. Holat: dizayn tasdiqlandi — yetti maketdan 4-variant («Daftar»)
tanlandi, kattaroq namuna (kompyuter + telefon, yorug' + tungi) ham tasdiqlandi
(«Ha, shu ko'rinishda boshlang»).
Tarmoq: `worktree-daftar-kirish-sahifasi`.

## Muammo

`student.dafzentrum.uz` dan tashqari ikki kirish sahifasi bor va ular bir-biriga
o'xshamaydi:

1. **`admin.dafzentrum.uz/login`** — to'liq ekranli ko'k barg fotosi (622 KB) va
   shisha panel. Rasm tasodifiy tanlangan, markazga aloqasi yo'q (CEO: «bargni
   o'zim shunchaki qo'ygan edim»).
2. **`lehrer.dafzentrum.uz/login`** — rasmsiz, bezaksiz oddiy sahifa.

Talab: bu kirishlar bir-biriga ma'noli, minimalistik va kreativ ko'rinishda
qayta qurilsin. O'quvchi kirishiga tegilmaydi.

## Yechim: sahifa — daftar varag'i

Ikkala sahifa bitta oila: joylashuv bir xil, farq faqat qog'oz chizig'i va siyoh
rangida. Farqning o'zi ma'no tashiydi:

| Sahifa | Qog'oz | Ma'nosi | Siyoh |
|---|---|---|---|
| Boshqaruv (admin) | katak | hisob-kitob | ko'k |
| O'qituvchi (lehrer) | chiziqli | yozuv, dars | yashil |

Qizil hoshiya chizig'i ikkalasida bir xil. Rasm yo'q — chiziqlar sof CSS.

### Ko'rinish

- **Qog'oz** butun ekranni egallaydi. Katak 16px, chiziq oralig'i 32px — ikkala
  qog'ozda qator bir xil: 32px (katakning har ikkinchi chizig'i).
- **Yozuv chiziq ustida turadi.** Sahifadagi hamma narsa varaq tepasidan butun
  qatorlar bilan sanaladi (tepa tasma 64px, har yozuv qatori 32px, tugma ikki
  qatorda), shuning uchun yorliq va qiymatlar chiziqqa tushadi. Shu sabab ustun
  ekran balandligi bo'yicha markazlanmaydi: oyna balandlashganda butun qatorlar
  bilan pastga suriladi.
- **Ustun** 384px gacha, eni bo'yicha markazda. Hoshiya chizig'i ustunning chap
  yonida (telefonda 16px, `sm` dan 20px chapda), sahifaning butun balandligi
  bo'ylab. Yozuv hoshiyadan boshlanadi.
- **Sarlavha**: tepasida kichik «DaF Sprachzentrum», ostida «Boshqaruv» yoki
  «O'qituvchi» — Fraunces kursiv, siyoh rangida (ruchkada yozilgandek).
- **Maydonlar** («Telefon raqam», «Parol») faqat pastki chiziq bilan — chiziq
  ustiga yozilgandek. Fokusda chiziq siyoh rangiga o'tadi. Shrift 16px (iOS
  maydonga bosganda sahifani kattalashtirmasin).
- **«Kirish»** tugmasi siyoh rangida, to'liq.
- **Xato xabari** qizil ruchkadagi tuzatishdek: serif kursiv, qizil,
  `role="alert"`.
- **Footer** qog'oz rangidagi tasma — hoshiya chizig'i footer matnini kesib
  o'tmaydi.
- **Tungi rejim**: to'q qog'oz, och siyoh; tugma och fonda to'q yozuv.

### Ranglar

Kontrast o'lchangan: matn ≥ 4.5:1, maydon chizig'i ≥ 3:1 (WCAG AA).

| Token | Admin yorug' | O'qituvchi yorug' | Admin tungi | O'qituvchi tungi |
|---|---|---|---|---|
| qog'oz (`--background`) | `#fdfdfb` | `#fdfdfb` | `#0f1626` | `#0e1a14` |
| chiziq (`--border`) | `#d9e3f2` | `#d9e3f2` | `#1c2740` | `#1a2c22` |
| hoshiya | `#f0a3a3` | `#f0a3a3` | `#7a3440` | `#7a3440` |
| matn (`--foreground`) | `#1e293b` | `#1e293b` | `#e6ecf8` | `#e8f1eb` |
| ikkilamchi matn (`--muted-foreground`) | `#56657a` (5.8) | `#56657a` (5.8) | `#9aa7bd` (7.4) | `#9db3a5` (8.0) |
| siyoh (`--primary`, `--ring`) | `#1e3a8a` (10.2) | `#14532d` (9.0) | `#c9d7f7` (12.5) | `#bfe3cc` (12.8) |
| tugma yozuvi (`--primary-foreground`) | `#ffffff` | `#ffffff` | `#0f1626` | `#0e1a14` |
| maydon chizig'i (`--input`) | `#6f88b3` (3.5) | `#5f9072` (3.6) | `#5a6f9a` (3.6) | `#4f7a60` (3.6) |
| qizil ruchka (`--destructive`) | `#b42318` (6.5) | `#b42318` (6.5) | `#ff8a80` (7.9) | `#ff8a80` (7.8) |

Qavs ichida — qog'ozga nisbatan kontrast.

## Qamrov

Quriladi:

1. `/login` — admin va o'qituvchi xostlarida.
2. «Parolni unutdingizmi?» oynasi — xodim ko'rinishi (`variant="default"`).
3. `/auth/telegram/callback` — xodim xostlarida («Kirish tasdiqlanmoqda…» va
   xato holati).

Tegilmaydi:

- O'quvchi kirishi (`student.` — Lumio, foto, shisha panel) va o'quvchi
  callback sahifasi.
- Kirish mantig'i: API chaqiruvlari, yo'naltirish, telefon maydoni qoidasi
  (`+` prefiks, cheklovsiz uzunlik — `client/CLAUDE.md` dagi istisno saqlanadi),
  parol tiklashdagi `+998` qoidasi.
- Telegram Mini App'dagi xodim ekrani (`/tg`, ADR-0045). U o'quvchi ekrani bilan
  bitta komponentda; alohida vazifa sifatida yozib qo'yildi.

Qilinmaydi (so'ralmagan): kun vaqtiga qarab nemischa salom, animatsiya,
logotip rasmi.

## Arxitektura

`.lumio` va `.form-theme` naqshi takrorlanadi: scope klassi shadcn tokenlarini
qayta belgilaydi, shuning uchun mavjud bo'laklar (`ThemeToggle`, `LoginFooter`,
`TelegramLoginButton`, parol tiklash oynasi) o'zgarmasdan yangi rangga o'tadi.

- **`src/app/globals.css`** — `.daftar` (admin, katak) va `.daftar.daftar-lines`
  (o'qituvchi, chiziqli) scope'lari, tungi juftlari bilan; `.daftar-sheet`
  (qog'oz chiziqlari, `background-image`), `.daftar-column::before` (hoshiya
  chizig'i — ustunga bog'langan, shuning uchun har kenglikda ustun bilan birga
  yuradi). Global `@theme` ga hech narsa qo'shilmaydi.
- **`src/lib/portal.ts`** — `daftarScope(portal)`: scope klasslarining yagona
  manbai (sahifa qobig'i ham, `body` ga ko'chiriladigan dialog ham shundan
  oladi). `PortalConfig` dan `subtitle` va `icon` olib tashlanadi (boshqa
  o'quvchisi yo'q); `title`: «Boshqaruv», «O'qituvchi».
- **`src/components/auth/daftar-sheet.tsx`** (server komponent) — qobiq: mavzu
  tugmasi, ustun (brend + sarlavha + `children`), footer. Login va callback
  sahifalari shuni ishlatadi. Fraunces kursiv shu faylda e'lon qilinadi —
  faqat shu sahifalarda yuklanadi.
- **`src/app/(auth)/login/page.tsx`** — o'quvchi shoxi o'zgarmaydi; qolgan
  portallar `DaftarSheet` ichida.
- **`src/app/(auth)/login/login-form.tsx`** — sarlavha va ikonlar qobiqqa
  ko'chadi; maydonlar pastki chiziqli. Mantiq o'zgarmaydi.
- **`src/components/auth/forgot-password-fields.tsx`** — `default` ko'rinishdagi
  maydonlar pastki chiziqli (`lumio` shoxi o'zgarmaydi).
  **`forgot-password-dialog.tsx`** — `contentClassName` (xuddi
  `logout-others-dialog.tsx` dagidek): Radix oynani `body` ga ko'chiradi, scope
  klassi `DialogContent` ning o'zida bo'lishi kerak.
- **`src/app/(auth)/auth/telegram/callback/`** — `page.tsx` server komponentga
  aylanadi (xostni o'qiydi, xodim xostida `DaftarSheet`), mavjud mijoz kodi
  yonidagi faylga ko'chadi. `<Suspense>` saqlanadi.
- **`public/login-admin-background.jpg`** o'chiriladi (endi ishlatilmaydi).
  `login-image-1.jpg` va `login-image-2.jpg` ham hech qayerda ishlatilmaydi —
  alohida commit bilan o'chiriladi.
- **`client/CLAUDE.md`** — «Login backdrops (liquid glass)» bo'limi yangilanadi:
  shisha panel endi faqat o'quvchida; xodim sahifalari — Daftar.

## Xatolar va chekka holatlar

- **Mini App ichida `/login`** — `MiniAppLoginGuard` avvalgidek ishlaydi.
- **`invoice.` / `form.` xostlari** `/login` ga yetib kelmaydi (middleware
  qayta yozadi); yetib kelsa — admin ko'rinishi (hozirgidek).
- **Localhost** — admin ko'rinishi; o'qituvchi ko'rinishi `lehrer.localhost`
  orqali tekshiriladi.
- **`prefers-reduced-motion`** — animatsiya yo'q, alohida shart kerak emas.
- **Lightning CSS tuzog'i** — `globals.css` da deklaratsiya qiymati ichida izoh
  yozilmaydi (butun `@layer` jimgina tushib qoladi).

## Tekshirish

- Brauzerda: admin va o'qituvchi × yorug' va tungi × 375px va 1440px; xato
  holati; parol tiklash oynasi; callback xato holati; o'quvchi kirishi
  o'zgarmagani.
- `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run build`.
- Saytga chiqarishdan oldin CEO'ga haqiqiy sahifa skrinshoti ko'rsatiladi.
