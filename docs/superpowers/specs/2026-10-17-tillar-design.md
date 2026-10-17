# Admin va o'qituvchi paneli: tillar (O'zbek lotin, O'zbek kirill, Rus, Nemis, Ingliz)

Sana: 17.10.2026. Holat: dizayn tasdiqlandi (CEO: tillar ro'yxati; «A» — tarjimani Claude yozadi,
keyin ko'rib chiqiladi; login tarjimasi oxirida va `feat/kirish-logotip-varaqlari` `main` ga
tushgandan keyin).
Bu **4 bo'lakli ishning 3-bo'lagi**: mexanizm va qobiq. Qolgan sahifalar — 4-bo'lak.
1-bo'lak (foydalanuvchi menyusi) va 2-bo'lak (dizayn uslublari) shu branchda tayyor; bu bo'lak
ularning menyusiga «Til» bandini qo'shadi.

## Muammo

Panel to'liq o'zbekcha lotinda, matnlar kodga qo'lda yozilgan (775 komponent fayli, ~15 mingga
yaqin matn). Markazda nemis tili o'qitiladi, xodimlar orasida rus va ingliz tilini afzal
ko'radiganlar bor, o'zbek kirill ham kerak. Til tizimi yo'q: tarjima qilinadigan joy ham,
tilni tanlash joyi ham yo'q.

## Yechim

### 1. Tillar

| id (`uiLocale`, `<html lang>`) | Nomi (o'z tilida) |
| --- | --- |
| `uz` (boshlang'ich) | O'zbekcha |
| `uz-Cyrl` | Ўзбекча |
| `ru` | Русский |
| `de` | Deutsch |
| `en` | English |

### 2. Matn kalit bo'lib xizmat qiladi

- Koddagi o'zbekcha lotin matnning o'zi kalit: `t("Bosh sahifa")`. Alohida kalit nomi yo'q.
  Parametrlar: `t("{n} ta o'quvchi", { n: 5 })` (`{n}` o'rniga qo'yiladi).
- **Lug'at** har til uchun alohida fayl: `src/i18n/dictionaries/ru.ts`, `de.ts`, `en.ts`,
  `Record<string, string>` ("o'zbekcha matn" → tarjima). `uz` lug'atsiz (matnning o'zi).
  `uz-Cyrl` lug'atsiz: o'zbek lotindan avtomatik o'giriladi (3-band); istisno kerak bo'lsa
  `dictionaries/uz-cyrl.ts` da qo'lda yoziladi (kalit shu, qiymat to'g'ri kirill).
- **Topilmasa o'zbekcha lotin chiqadi** (xato yo'q): tarjima qilinmagan sahifalar shunday
  ko'rinadi, buzilmaydi.
- `src/i18n/translate.ts` — sof funksiya `translate(locale, dictionary, source, params?)`
  (React'siz, testlanadi). `useT()` (`hooks/use-t.ts`) joriy tilni oladi va `t` ni qaytaradi.
- **Ro'yxatlardagi matn** (menyu nomlari, breadcrumb nomlari — modul darajasidagi massivlar):
  literal `msg("Moliya")` bilan o'raladi — `msg` matnni o'zgartirmaydi, faqat tekshiruv uni
  topishi uchun; ekranga chiqarishda `t(item.title)`.
- **Ko'plik shakllari** (rus/nemis/ingliz) bu bo'lakda yo'q: qobiqda hisob bilan matn yo'q.
  Kerak bo'lsa 4-bo'lakda `tn()` qo'shiladi.
- **Raqam va sana formati o'zgarmaydi** (`1 500 000`, `dd.MM.yyyy`, client/CLAUDE.md qoidasi).
  Valyuta qo'shimchasi «so'm» matn sifatida lug'atda: `ru` — «сум», `de` — «Sum», `en` — «UZS»;
  `uz-Cyrl` — «сўм» (avtomatik).

### 3. O'zbek kirill: lotindan avtomatik o'girish

`src/i18n/translit-cyrl.ts`, sof funksiya `toCyrillic(latin)`. Qoidalar (rasmiy 1995 alifbosi):

- **Ikki harfli:** `sh`→ш, `ch`→ч, `ng`→нг, `o'`→ў, `g'`→ғ (apostrof turlari: `'` `ʻ` `ʼ` `‘` `’` `` ` ``).
  Boshqa o'rindagi apostrof → ъ (`ma'lumot`→маълумот, `so'm`→сўм bu `o'`).
- **Bir harfli:** a а, b б, d д, e е, f ф, g г, h ҳ, i и, j ж, k к, l л, m м, n н, o о, p п, q қ,
  r р, s с, t т, u у, v в, x х, y й, z з, `ts`→ц.
- **`e`** so'z boshida yoki unlidan keyin → э (`elektron`→электрон), boshqa joyda е.
- **`ya yo yu ye`** so'z boshida yoki undoshdan keyin → я ё ю е (`yangi`→янги, `yordam`→ёрдам);
  unlidan keyin y → й + unli (`mayda`→майда); `yo'` → йў (`yo'l`→йўл).
- Bosh harf saqlanadi (`Sh`→Ш, `SH`→Ш).
- **O'girilmaydi:** `{…}` ichidagi parametr nomi; URL, e-pochta, `@nom`; barcha bosh harfli qisqartmalar
  (2+ harf: PDF, KPI, SMS, ID, CSV, QR) va `KEEP_LATIN` ro'yxatidagi so'zlar (Excel, Telegram, Payme,
  Click, Uzum, Mock, Daftar…). Raqam va tinish belgilari o'z holicha.
- Noto'g'ri chiqqan so'zlar `dictionaries/uz-cyrl.ts` istisnosiga yoziladi.

Testlar kafolatli juftliklarni tekshiradi (Bosh sahifa→Бош саҳифа, O'qituvchilar→Ўқитувчилар,
To'lovlar→Тўловлар, Ish haqi→Иш ҳақи, Guruhlar→Гуруҳлар, Hisobotlar→Ҳисоботлар,
Yordam→Ёрдам, Texnik yordam→Техник ёрдам, Mening oyligim→Менинг ойлигим, Qo'llanma→Қўлланма,
Ma'lumot→Маълумот, Xodimlar KPI→Ходимлар KPI, `{n} ta o'quvchi` parametri saqlanadi) va
o'girishning har bir harf qoidasini.

### 4. Tilni qayerdan olamiz

- **Server:** `(dashboard)/layout.tsx` (server komponent) `cookies()` dan `daf-locale` ni o'qiydi
  (Next 16 da `cookies()` asinxron, uni layoutda chaqirish faqat shu marshrut guruhini dinamik
  qiladi; admin va o'qituvchi sahifalari baribir kirishdan keyin chiziladi; o'quvchi portali, ommaviy
  forma va statik sahifalar o'zgarmaydi). Noma'lum yoki yo'q → `uz`. Lug'at ham serverda yuklanadi
  (`loadDictionary(locale)`, dinamik `import`) va `<I18nProvider locale dictionary>` ga beriladi:
  shuning uchun o'zbekcha matn «chaqnab» qolmaydi va faqat tanlangan til lug'ati yuboriladi.
- **`I18nProvider`** (`components/providers/i18n-provider.tsx`, client) holatda `{ locale, dictionary }`
  saqlaydi, `document.documentElement.lang` ni qo'yadi, `setLocale(next)` beradi.
- **Almashtirish `setLocale(next)`:** lug'atni yuklaydi (klientda ham dinamik `import`) va holatni
  almashtiradi — sahifa qayta yuklanmaydi; keyin cookie'ni (`daf-locale`, `path=/`, 1 yil,
  `SameSite=Lax`) yozadi; kirgan bo'lsa `PATCH /users/ui-locale`. Optimistik: xato bo'lsa eski tilga
  qaytadi va `toast.error("Tilni saqlab bo'lmadi")` (uslub o'zgartirishidagi `changeUiSkin` qoidasi:
  faqat oxirgi chaqiruv harakat qiladi). Mantiq sof funksiyada (`changeUiLocale`), skin'dagi kabi
  testlanadi.
- **Akkaunt bilan moslash** (`LocaleSync`, `AuthProvider` ichida): kirgan foydalanuvchida `uiLocale`
  bor va joriy tildan farq qilsa — shunga o'tadi (cookie ham yangilanadi, PATCH yo'q: bu akkauntning
  o'zidan). `uiLocale` yo'q va joriy til `uz` emas bo'lsa (kirishdan oldin tanlangan) — bir marta
  akkauntga yoziladi. Chiqqanda cookie qoladi (qurilma tili).

### 5. Server

- **Prisma:** `User.uiLocale String?` (null = `uz`), migratsiya `ADD COLUMN IF NOT EXISTS "uiLocale" TEXT`,
  dev bazada `migrate dev` ishlamaydi (loyiha tartibi: `migrate diff` → `db execute` → `migrate resolve`),
  hech qaysi bazaga qo'llanmaydi.
- **`server/src/common/ui-locales.ts`:** `UI_LOCALES = ['uz','uz-Cyrl','ru','de','en']`, `DEFAULT_UI_LOCALE`.
  Klient `lib/locales.ts` nusxasi; test ikkalasini solishtiradi (`ui-skins` kabi).
- **`PATCH /users/ui-locale`** (`@AnyStaff()`, `UpdateUiLocaleDto { locale }`, `@IsIn(UI_LOCALES, { message:
  "Noma'lum til" })`): faqat chaqiruvchining qatorini yozadi, tarixga yozilmaydi; javob `{ uiLocale }`;
  `users.controller.ts` da `@Patch(':id')` dan oldin. Marshrut manifestiga qo'shiladi
  (`route-access.snapshot.json`, `branch-route-policy.ts` `SELF`).
- **`formatUser`** `uiLocale` ni qaytaradi (kirish, `refresh`, Mini App). `AuthUser.uiLocale?: string | null`.
- **ADR-0098:** shaxsiy sozlama akkauntda, qurilmada cookie; matn kalit; serverdan keladigan matnlar
  o'zbekcha lotin qoladi.

### 6. Qobiq: shu bo'lakda tarjima bo'ladigan joylar

Sidebar (menyu nomlari: `nav-items.ts`, `payments-nav.ts`, `reports-nav.ts`, `daf-nav.ts`; `app-sidebar.tsx`),
sidebar pasti (`sidebar-footer-info.tsx`), yuqori panel (`dashboard-header.tsx`, `branch-switcher.tsx`,
qidiruv `global-search/search-dropdown.tsx`, `tasks/header-task-button.tsx`,
`qollanma/qollanma-yordam-tugmasi.tsx`, `tashkent-clock.tsx` tooltipi), breadcrumb
(`app-breadcrumb.tsx`, `lib/breadcrumb-routes.ts`), foydalanuvchi menyusi (`header-user-menu.tsx`),
bildirishnoma qo'ng'irog'i (`notifications/notification-bell.tsx`, `notification-row.tsx`,
`notification-actions.ts` matnlari, `push-permission-prompt.tsx`). **Login** — alohida oxirgi vazifa (8-band).
Sozlamalar, hisobotlar, jadvallar va boshqa sahifa matnlari — 4-bo'lak.

**Tarjima qilinmaydigan qobiq matnlari:** serverdan keladigan bildirishnoma sarlavhasi va matni, foydalanuvchi
ismi, filial nomi, qo'llanma (`qollanma/kontent` — o'zbekcha), `Yangilangan: dd.MM.yyyy · sha` ning
sana va kodi (faqat «Yangilangan» so'zi tarjima qilinadi).

### 7. Tanlash joyi

- **Foydalanuvchi menyusi:** «Dizayn uslubi» dan keyin yangi `DropdownMenuSub` **«Til»** (ikonka `Languages`),
  ichida besh qator (har biri o'z nomida: O'zbekcha, Ўзбекча, Русский, Deutsch, English), joriysi belgilangan.
  `useLocale()` hook (`locale`, `setLocale`).
- **Login** (8-band): pastda kichik til tanlagich, faqat cookie'ga yozadi.

### 8. Login (oxirgi vazifa)

`feat/kirish-logotip-varaqlari` hali `main` da emas va `login-form.tsx`, `page.tsx`, `staff-sign-in-shell.tsx`,
`forgot-password-*`, `telegram-login-button.tsx`, `mini-app-notices.tsx` ni qayta yozyapti. Shu fayllarga
tegish to'qnashuv beradi, shuning uchun login tarjimasi **shu branch `main` ga tushgandan keyin**,
`main` ni shu branchga birlashtirib (yoki yangi branchda) bajariladi: 5 til uchun login matnlari
(`t()`/`msg()`), `(auth)` layoutida cookie'dan til o'qish (login ham dinamik, o'zgarish yo'q) va til
tanlagich. Ungacha login o'zbekcha lotin.

### 9. Tekshiruv skripti

`npm run i18n:check` = `vitest run src/i18n` (yangi vositasiz, CI da oddiy testlar bilan yuradi). Test:

1. `src/**/*.{ts,tsx}` dan `t("…")` va `msg("…")` literallarini yig'adi (birinchi argument literal bo'lishi
   shart; literal bo'lmagan `t(...)` chaqiruvi — xato, `translate` ning o'zi va testlar bundan mustasno).
2. **Qat'iy fayllar** ro'yxati (`STRICT_FILES`, shu bo'lakda 6-band fayllari): ularning har bir literali
   `ru`, `de`, `en` lug'atlarida bo'lishi shart. Boshqa fayllarda — tekshirilmaydi (4-bo'lak ro'yxatni
   kengaytiradi).
3. Lug'atdagi har kalit kodda biror joyda ishlatilishi shart (eski kalit qolmasin).
4. Har tarjimada parametrlar (`{n}`) kalitdagi bilan bir xil.
5. Tarjima bo'sh satr emas.

## Chekka holatlar

- Noma'lum cookie qiymati yoki akkauntdagi noma'lum til → `uz`, xato yo'q.
- Lug'at fayli yuklanmadi (tarmoq): `uz` ko'rsatiladi, toast «Tilni yuklab bo'lmadi»; cookie yozilmaydi.
- Bir vaqtda ikki marta tanlash: oxirgisi yutadi.
- Kirgandan keyin akkauntdagi til cookie'dan farq qilsa — akkaunt yutadi (boshqa qurilmada tanlangan til
  shu qurilmaga ham o'tadi).
- Serverdan o'zbekcha lotin matn kelsa (xato xabari, bildirishnoma) — o'zgarishsiz ko'rsatiladi;
  `uz-Cyrl` da ham o'girilmaydi (serverniki).
- `<html lang>` `uz` bilan chiziladi, til almashgach `document.documentElement.lang` yangilanadi.
- IBM Plex Sans ga `cyrillic` subseti qo'shiladi (hozir yo'q), aks holda kirill va rus matni zaxira
  shriftda chiqadi. Boshqa uslublarning shriftlarida kirill bor.
- Rus va nemis matn o'zbekchadan uzunroq: sidebar, tugma va jadval sarlavhalari sig'ishi brauzerda
  tekshiriladi (qisqartirish — `truncate` yoki lug'atda qisqaroq tarjima).

## Test

- `translate.test.ts`: lug'atdan olish, topilmasa o'zbekcha, parametr qo'yish, `uz-Cyrl` o'girish va istisno.
- `translit-cyrl.test.ts`: 3-banddagi juftliklar, har qoida, saqlanadigan tokenlar.
- `locales.test.ts`: ro'yxat besh til, boshlang'ich `uz`, server ro'yxati bilan bir xil.
- `change-ui-locale.test.ts`: optimistik, xatoda qaytish, oxirgi chaqiruv yutishi.
- `i18n-coverage.test.ts`: 9-band tekshiruvlari.
- `header-user-menu.test.ts` ga: «Til» va besh nom.
- Server: `users.controller.spec.ts` (`anyStaff`), `users.service.spec.ts`, DTO spec (besh qiymat, noma'lum
  rad), `auth.service.spec.ts` (`uiLocale`), manifest specs.
- `tsc`, `eslint src`, `npm test` (klient va server), `npm run build`, `npm run typecheck` (server).
- Brauzerda: besh til bo'yicha qobiq (sidebar, yuqori panel, menyu, breadcrumb, qo'ng'iroq), uzun rus va
  nemis matnlar sig'adimi, til almashganda sahifa qayta yuklanmaydi, qayta yuklagandan keyin chaqnash
  yo'q, rus va kirill harflari to'g'ri shriftda, `<html lang>`.

## Chiqarish tartibi

Migratsiya (qo'lda), server, klient — ADR-0097 dagidek. Eski klient yangi maydonni ko'rmaydi; yangi klient
eski serverda tilni akkauntga yozolmaydi (`PATCH` 404, toast), cookie baribir ishlaydi. `client/CLAUDE.md`
ga «Languages» bo'limi (matn kalit, `msg`, qat'iy fayllar, yangi til qo'shish tartibi, serverdan kelgan
matnlar), qo'llanma (`interfeys.mdx`) va `yangiliklar.ts` yangilanadi.
