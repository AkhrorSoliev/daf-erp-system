# ADR-0102 — Interfeys tili: matn kalit, akkaunt va qurilmada saqlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0101, `client/src/i18n/`, `server/src/common/ui-locales.ts`, `server/src/users/users.service.ts` (`updateUiLocale`), `client/src/i18n/context.tsx` (`I18nProvider`, `useT`, `useLocale`), `client/src/i18n/change-ui-locale.ts`, `docs/superpowers/specs/2026-10-17-tillar-design.md`, `docs/superpowers/plans/2026-10-17-tillar.md`

## Kontekst

Admin va o'qituvchi paneli to'liq o'zbekcha lotinda, matnlar kodga qo'lda yozilgan (775 komponent fayli, ~15 mingga yaqin matn). Markazda nemis tili o'qitiladi, xodimlar orasida rus va ingliz tilini afzal ko'radiganlar bor, o'zbek kirill ham kerak. Til tizimi yo'q edi: tarjima qilinadigan joy ham, tilni tanlash joyi ham. CEO besh tilni tasdiqladi; tarjimani Claude yozadi, keyin odam ko'rib chiqadi. Panel bir yo'la qayta yozilmaydi: tarjima sahifa-sahifa qo'shiladi, shuning uchun tarjimasiz sahifa buzilmasligi shart.

## Qaror

1. **Beshta til:** `uz` (boshlang'ich), `uz-Cyrl`, `ru`, `de`, `en`. Ro'yxat klientda (`client/src/i18n/locales.ts`) va serverda (`server/src/common/ui-locales.ts`), `locales.test.ts` ikkalasini solishtiradi.
2. **Matn kalit bo'lib xizmat qiladi.** Koddagi o'zbekcha lotin matnning o'zi kalit: `t("Bosh sahifa")`, parametr bilan `t("{n} ta o'quvchi", { n })`. Lug'at har til uchun alohida fayl (`dictionaries/ru.ts`, `de.ts`, `en.ts`), "o'zbekcha matn" → tarjima. **Tarjima topilmasa o'zbekcha matn chiqadi**, xato yo'q. Ro'yxatlardagi matn (menyu nomlari, breadcrumb nomlari) `msg("…")` bilan o'raladi: `msg` matnni o'zgartirmaydi, faqat tekshiruv uni topishi uchun.
3. **O'zbek kirill lotindan qoida bo'yicha o'giriladi** (`translit-cyrl.ts`, `toCyrillic`). Qoida noto'g'ri chiqargan so'z uchun istisno `dictionaries/uz-cyrl.ts` da qo'lda yoziladi; bosh harfli qisqartmalar va `KEEP_LATIN` ro'yxatidagi so'zlar (Excel, Telegram…) lotinda qoladi.
4. **Til akkauntda va qurilmada saqlanadi.** Akkauntda: `User.uiLocale String?` (null = `uz`), yozish faqat `PATCH /users/ui-locale` (`@AnyStaff()`, qiymat `IsIn(UI_LOCALES)`). Qurilmada: `daf-locale` cookie (1 yil, `SameSite=Lax`). Kirgan foydalanuvchida **akkaunt yutadi**: akkauntdagi til qurilmadagidan farq qilsa shunga o'tadi; akkauntda til tanlanmagan bo'lsa, qurilmada tanlangani bir marta akkauntga yoziladi. Til sahifa chizilishidan oldin serverda cookie'dan o'qiladi (`(dashboard)/layout.tsx`, `cookies()`), lug'at ham shu yerda yuklanib `I18nProvider` ga beriladi: o'zbekcha matn «chaqnab» qolmaydi va faqat tanlangan til lug'ati yuboriladi. Bu faqat panel qatlamini dinamik qiladi; o'quvchi portali, ommaviy forma va statik sahifalar o'zgarmaydi. Almashtirish `setLocale` bilan, sahifa qayta yuklanmaydi (qadamlar «Oqibatlar»da). `<html lang>` ni sahifa o'qilayotganda inline skript (`languageBootScript`, `(dashboard)/layout.tsx`) qo'yadi, keyin `I18nProvider` effekti ushlab turadi va dashboard tark etilganda `uz` ga qaytaradi.
5. **Serverdan keladigan matnlar tarjima qilinmaydi:** xato xabarlari, bildirishnoma sarlavhasi va matni, PDF, Excel, Telegram, SMS. Ular o'zbekcha lotin qoladi (`uz-Cyrl` da ham o'girilmaydi). Ismlar, filial nomlari va boshqa ma'lumot ham shunday.
6. **Raqam va sana formati tilga bog'liq emas** (`1 500 000`, `dd.MM.yyyy`, `client/CLAUDE.md` qoidasi). Faqat «so'm» kabi qo'shimcha matn lug'atda tarjima qilinadi.
7. **`npm run i18n:check`** (`src/i18n/i18n-coverage.test.ts`) `STRICT_FILES` dagi qobiq fayllarining to'liq tarjimasini tekshiradi: har matn `ru`, `de`, `en` da bor, eski kalit yo'q, tarjima bo'sh emas, `{param}` lar kalitdagi bilan bir xil. Sahifani tarjima qilish = matnlarini o'rash, faylni `STRICT_FILES` ga qo'shish, tarjimalarni yozish.

## Taqiqlanadi

- Serverdan kelgan matnni mijozda taxminiy tarjima qilish (xato xabarini kalit sifatida ushlab, so'zma-so'z o'girish).
- Lug'atda eski kalit qoldirish: matn kodda o'zgarsa yoki o'chsa, uch lug'atdan ham olib tashlanadi (test shuni tekshiradi).
- Tarjimasiz `{param}` o'zgartirish: tarjimada parametr nomi kalitdagi bilan bir xil bo'lishi shart.
- Kalit uchun literal bo'lmagan ifodani `msg(…)` ga berish: `msg` faqat qator literalini oladi, `t(o'zgaruvchi)` esa `msg` dan kelgan qiymat uchun ruxsat.

## Muqobillar

- **Kalit nomlari (`nav.home`)**: lug'at tartibliroq, lekin kod o'qilmay qoladi (`t("nav.home")` nima chiqarishi ko'rinmaydi), har matn uchun ikki joyni tahrirlash kerak. Tanlanmadi.
- **DOM'ni ish vaqtida tarjima qilish** (matn tugunlarini almashtirish): kodni o'zgartirmaydi, lekin mo'rt: dinamik matn, React qayta chizishi va parametrli matnlarda buziladi. Tanlanmadi.
- **`next-intl`**: tayyor kutubxona (marshrut prefikslarisiz sozlash ham bor), lekin qo'shimcha bog'liqlik va o'zining xabar-kalit formatini olib keladi: 15 mingga yaqin mavjud matnni kalitga ko'chirish kerak bo'lardi. Bizga yuz qator atrofidagi o'z kodimiz yetadi (`translate`, `I18nProvider`, `changeUiLocale`). Tanlanmadi.
- **Faqat cookie (akkauntsiz)**: bazaga tegmaydi, lekin har qurilmada qayta tanlash kerak. CEO tanlamadi (ADR-0101 dagi sabab).

## Oqibatlar

- Migratsiya qo'shimcha (`ADD COLUMN IF NOT EXISTS "uiLocale"`), eski klient yangi maydonni ko'rmaydi.
- **Chiqarish tartibi qat'iy: migratsiya, server, klient.**
  - Server migratsiyadan oldin chiqsa: Prisma yaratilgan klienti `User` qatorini o'qiganda `uiLocale` ustunini ham so'raydi, ustun esa hali yo'q, shuning uchun `User` ni `select`siz o'qiydigan so'rovlar, jumladan kirish va `refresh`, xato bilan yiqiladi.
  - Klient serverdan oldin chiqsa: eski serverda `/users/ui-locale` yo'li yo'q, uni `PATCH /users/:id` (`@Can('employees.manage')`, `ParseIntPipe`) ushlab oladi, shuning uchun kirgan xodimning har til tanlovi rad etiladi (huquqi yo'qda 403, huquqi borda, masalan CEO da, 400), har tanlov qaytariladi va xato xabari chiqadi.
- **Til almashganda kod aynan shunday ishlaydi** (`changeUiLocale`, `I18nProvider.setLocale`):
  1. Yangi til lug'ati yuklanadi. Yuklanmasa hech narsa o'zgarmaydi (cookie yozilmaydi), «Tilni yuklab bo'lmadi» xabari chiqadi.
  2. `apply`: sahifa darrov yangi tilga o'tadi va `daf-locale` cookie yangi til bilan qayta yoziladi.
  3. `persist`: kirgan xodimda `PATCH /users/ui-locale`. Hech kim kirmagan bo'lsa yoki o'zgarish akkauntning o'zidan kelgan bo'lsa (`LocaleSync`), bu qadam o'tkazib yuboriladi: til faqat qurilmada qoladi.
  4. `PATCH` yiqilsa: eng so'nggi tanlov bo'lsa, `apply` eski til bilan qayta chaqiriladi, ya'ni sahifa **eski tilga qaytadi va cookie ham eski tilga qayta yoziladi** (cookie «baribir ishlaydi» emas). Xabar `getErrorMessage(error, "Tilni saqlab bo'lmadi")` bilan chiqadi: serverning o'z xato matni, bo'lmasa shu o'zbekcha matn. Eski serverda bu Nest'ning o'z matni bo'ladi (403 yoki 400, yuqoridagi tartib buzilganda), o'zbekcha emas.
  5. Ikki tez tanlovdan faqat oxirgisi sahifaga tegadi.
- Chiqishda `daf-locale` cookie qoladi (qurilma tili). Akkauntdagi til qurilmadagidan farq qilsa, `LocaleSync` sahifani akkauntdagi tilga o'tkazadi va cookie ham yangilanadi (bu holda `PATCH` yuborilmaydi).
- Boshqa qurilmada o'zgartirilgan til shu qurilmaga keyingi token yangilanishida yoki qayta kirishda keladi.
- **Tarjima hozircha qobiqda:** chap menyu (menyu nomlari va pastki qator), yuqori panel (qidiruv, izohlar, filial tanlash), foydalanuvchi menyusi, breadcrumb, bildirishnoma qo'ng'irog'i paneli. Sahifalar, yuqori paneldagi tugmalar ochadigan oynalar (qo'llanma paneli, topshiriq yaratish oynasi), `/notifications` sahifasi, qidiruv natijalaridagi sahifa nomlari (`data/searchable-pages.ts`) va o'quvchi holati belgisi matni (`lib/status-config.ts`) hali o'zbekcha. Umumiy o'zbekcha yordamchilar (holat belgilari va boshqalar) ularni ishlatadigan sahifalar tarjima qilinganda tarjima qilinadi. Sahifalar keyingi bo'lakda `STRICT_FILES` ga qo'shilib boradi.
- `STRICT_FILES` test o'ralmagan matnni ko'rmaydi: tarjima qilingan sahifa rus tilida ko'z bilan tekshiriladi.
- Kirish sahifasi tarjimasi `feat/kirish-logotip-varaqlari` `main` ga tushgandan keyin qilinadi (u o'sha fayllarni qayta yozyapti); ungacha kirish sahifasi, o'quvchi portali va ommaviy forma o'zbekcha lotin.
- **Plex shriftiga alohida `cyrillic` subseti qo'shilmaydi.** `next/font` Google CSS dagi hamma subsetni (har biri `unicode-range` bilan) o'zi xostlaydi; `subsets` faqat qaysi fayllar har sahifada oldindan yuklanishini (preload) belgilaydi. Ilova kirill glifini kerak bo'lganda o'zi yuklaydi, zaxira shriftga tushmaydi. Subset qo'shish kirish va o'quvchi portali sahifalariga ham uchta fayl preloadini qo'shardi, o'zbek kirill uchun kerak fayllarni (ғ, қ, ҳ `cyrillic-ext` blokida) esa baribir oldindan yuklamasdi.
- Rus va nemis matn o'zbekchadan uzunroq: yangi tarjima qo'shganda sidebar, tugma va jadval sarlavhalariga sig'ishi brauzerda tekshiriladi (`truncate` yoki lug'atda qisqaroq tarjima).
- Ko'plik shakllari (`tn()`) yo'q: qobiqda hisob bilan matn yo'q edi. Sahifalar tarjima qilinganda kerak bo'lsa qo'shiladi.
