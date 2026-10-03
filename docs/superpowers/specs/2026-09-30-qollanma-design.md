# Qo'llanma — admin panel ichidagi foydalanuvchi hujjatlari (dizayn)

**Sana:** 2026-09-30
**Bog'liq:** [ADR indeksi](../../adr/README.md), [CONTEXT.md](../../../CONTEXT.md),
[docs/role-access.md](../../role-access.md), eski
[moliya-qollanma.html](../../moliya-qollanma.html) (shu ish uni almashtiradi)

## Nima uchun

Tizim qoidalari uch joyda yozilgan: `CONTEXT.md` (atama nima), `CLAUDE.md`
(qanday ishlanadi), `docs/adr/` (nega shunday). Uchalasi ham dasturchi uchun.
Direktor, administrator, kassir va ustoz o'qiy oladigan qatlam yo'q.

Bitta urinish bor edi: `docs/moliya-qollanma.html` (+ PDF). U 2026-04-30 da
yozilgan, 50 ta ADR'ning hammasi undan keyin qabul qilingan. Tekshiruv
(30.09.2026) 20 ta eskirgan gapni topdi: oylik to'lov yo'q, «kelmagan
o'quvchidan pul yechilmaydi», «ustoz 3 kun keyin ham davomat qiladi», 50%
qaytarish qoidasi va boshqalar. Sabab bitta: qo'llanma koddan alohida yashaydi,
kod o'zgaradi, qo'llanma esdan chiqadi.

Maqsad: admin panel ichida, kod bilan bitta PR'da yangilanadigan, rolga qarab
ko'rinadigan, diagramma va haqiqiy skrinshotlari bor qo'llanma.

## Qabul qilingan qarorlar (30.09.2026, foydalanuvchi bilan)

1. **Joy — admin panel ichida, `/qollanma`.** Notion (MCP orqali) va alohida
   docs sayt ko'rib chiqildi. Notion rad etildi: koddan alohida yashaydi
   (moliya-qollanma bilan bir xil muammo), «Publish» havolasi hammaga ochiq,
   qo'llanmada esa oylik va shartnoma qoidalari bor. Alohida sayt keyinga
   qoldi: ERP boshqa markazlarga sotilsa, shu MDX fayllardan ochiq sayt
   yig'iladi.
2. **Rasmlar ikki xil.** Diagramma — MDX ichida Mermaid matni (kod bilan bitta
   PR'da yangilanadi). Skrinshot — skript oladi, **lokal nusxadan, soxta
   ma'lumot bilan**. Production rad etildi: parolni skript kiritolmaydi,
   haqiqiy o'quvchi ma'lumoti git'ga tushadi, tugma bosish xavfli.
3. **Hajm — hamma bo'lim.** Foydalanuvchi: «Barcha qo'shilishi kerak bo'lgan
   qismlarni tahlil qil». Tahlil manbalari: 50 ADR, `server/CLAUDE.md`,
   `CONTEXT.md`, `docs/role-access.md`, klientdagi barcha sahifa va dialoglar.

Lokal sinov (30.09.2026) quvur ishlashini ko'rsatdi: `daf_docs` bazasidan
«Guruhdan chiqarish» oynasining haqiqiy skrinshoti olindi.

## Kimlar uchun

| Rol | Nimani o'qiydi |
|---|---|
| CEO (1) | Hammasi |
| Filial direktori (2) | Hammasi, faqat CEO'ga tegishli sozlamalar belgilanadi |
| Administrator (3) | O'quvchilar, guruhlar, davomat, to'lovlar, lidlar, mock, sozlamalar (ruxsat etilganlari) |
| Kassir (5) | Boshlash, jadval, topshiriqlar, to'lovlar, qarzdorlik, Telegram |
| Ustoz (4) | Boshlash, jadval, topshiriqlar, davomat, mening oyligim, Telegram |

Rol filtri **qulaylik uchun, xavfsizlik chegarasi emas**: menyu va qidiruv
faqat rolga tegishli sahifalarni ko'rsatadi (bir nechta roli bor xodim —
hammasining yig'indisini), lekin sahifa URL orqali ochilaveradi. Shuning uchun qo'llanmada maxfiy narsa bo'lmaydi: haqiqiy
summalar, shaxsiy ma'lumot, parol, production raqamlari yo'q.

## Tuzilish

Slug — URL qismi (`/qollanma/<bo'lim>/<sahifa>`). ADR ustuni — boshlang'ich
taqsimot; kontent yozilganda aniqlanadi, to'liqligini test tekshiradi.
Rollar: 1 CEO, 2 filial direktori, 3 administrator, 4 ustoz, 5 kassir.

| Bo'lim | Sahifa (slug) | Sarlavha | Rollar | ADR | Rasm |
|---|---|---|---|---|---|
| Boshlash | `boshlash/tizimga-kirish` | Tizimga kirish va parol | 1–5 | 0022, 0030, 0031 | — |
| | `boshlash/interfeys` | Ekran tuzilishi | 1–5 | — | skrinshot |
| | `boshlash/rollar-va-huquqlar` | Rollar va huquqlar | 1–5 | 0001, 0002, 0007, 0026, 0027, 0028 | jadval |
| | `boshlash/topshiriqlar` | Izohlar va topshiriqlar | 1–5 | — | — |
| | `boshlash/lugat` | Lug'at | 1–5 | 0015 | — |
| O'quvchilar | `oquvchilar/hayot-davri` | O'quvchining hayot davri | 1,2,3 | 0015, 0017, 0018 | diagramma |
| | `oquvchilar/yangi-oquvchi` | Yangi o'quvchi | 1,2,3 | 0032, 0039 | — |
| | `oquvchilar/guruhga-qoshish` | Guruhga qo'shish va o'tkazish | 1,2,3 | — | — |
| | `oquvchilar/muzlatish` | Muzlatish va qaytarish | 1,2,3 | — | — |
| | `oquvchilar/guruhdan-chiqarish` | Guruhdan chiqarish va pul | 1,2,3 | 0043, 0044 | skrinshot, diagramma |
| | `oquvchilar/chetlatish-va-arxiv` | Chetlatish, bitirish, arxiv | 1,2,3 | 0033 | — |
| | `oquvchilar/oquvchi-kartasi` | O'quvchi kartasi | 1,2,3 | 0004, 0037 | skrinshot |
| Guruhlar | `guruhlar/guruh-yaratish` | Guruh yaratish | 1,2,3 | — | — |
| | `guruhlar/guruh-holatlari` | Guruh holatlari | 1,2,3 | 0036, 0041 | diagramma |
| | `guruhlar/dars-ozgarishlari` | Darsni bekor qilish, ko'chirish, o'rinbosar | 1,2,3 | 0053 | — |
| | `guruhlar/bayramlar` | Bayramlar | 1,2,3 | — | — |
| | `guruhlar/jadval` | Jadval | 1–5 | — | — |
| Davomat | `davomat/davomat-olish` | Davomat olish | 1,2,3,4 | — | skrinshot |
| | `davomat/oldindan-belgilash` | Oldindan belgilash | 1,2,3 | — | — |
| | `davomat/avtomatik-pauza` | Avtomatik pauza | 1,2,3 | 0023 | diagramma |
| | `davomat/eslatmalar` | Davomat eslatmalari | 1,2,3,4 | — | — |
| To'lovlar | `tolovlar/tolov-turlari` | Kurs qanday to'lanadi | 1,2,3,5 | — | — |
| | `tolovlar/oylik-tolov` | Oylik to'lov | 1,2,3,5 | 0042, 0053 | diagramma |
| | `tolovlar/dars-paketi` | Dars paketi | 1,2,3,5 | — | — |
| | `tolovlar/tolov-qayd-qilish` | To'lov qayd qilish | 1,2,3,5 | 0021 | skrinshot |
| | `tolovlar/tolovni-togrilash` | To'lovni to'g'rilash | 1,2,3,5 | — | — |
| | `tolovlar/onlayn-tolov` | Payme va Click | 1,2,3,5 | — | — |
| | `tolovlar/pul-qaytarish` | Pulni qaytarish va yechib olish | 1,2,3 | — | — |
| | `tolovlar/qarzdorlik` | Qarzdorlik | 1,2,3,5 | — | skrinshot |
| Ustoz oyligi | `ustoz-oyligi/stavka` | Stavka | 1,2 | 0034, 0050 | — |
| | `ustoz-oyligi/oylik-hisoblash` | Oylik qanday hisoblanadi | 1,2 | 0006, 0051, 0052 | diagramma |
| | `ustoz-oyligi/avans` | Avans | 1,2 | — | — |
| | `ustoz-oyligi/oylikni-berish` | Oylikni tasdiqlash va berish | 1,2 | — | skrinshot |
| | `ustoz-oyligi/mening-oyligim` | Mening oyligim | 4 | — | — |
| Xarajatlar | `xarajatlar/xarajat-kiritish` | Xarajat kiritish | 1,2 | — | — |
| | `xarajatlar/kassa` | Filial kassasi | 1,2 | — | — |
| Hisobotlar | `hisobotlar/moliya-umumiy` | Umumiy ma'lumotlar va sof foyda | 1,2 | 0001, 0005, 0012, 0016, 0038 | skrinshot |
| | `hisobotlar/excel-hisobot` | Excel hisobotlari | 1,2 | 0021 | — |
| | `hisobotlar/boshqa-hisobotlar` | Boshqa hisobotlar | 1,2,3 | 0035 | — |
| Lidlar | `lidlar/lidlar-bilan-ishlash` | Lidlar bilan ishlash | 1,2,3 | 0017, 0018 | — |
| | `lidlar/formalar` | Formalar va javoblar | 1,2,3 | — | — |
| | `lidlar/aloqa-markazi` | Aloqa markazi | 1,2,3 | — | — |
| Mock imtihonlar | `mock-imtihonlar/mock-imtihon` | Mock imtihon | 1,2,3 | 0046 | — |
| Telegram | `telegram/xabarlar-vaqti` | Telegram xabarlari qachon keladi | 1–5 | 0025, 0042 | jadval |
| | `telegram/bot-va-kabinet` | Bot va xodim kabineti | 1–5 | 0029, 0040, 0045 | — |
| | `telegram/hisobot-guruhlari` | Hisobot guruhlari | 1,2 | — | — |
| Sozlamalar | `sozlamalar/filial-xona-kurs` | Filial, xona, kurs | 1,2,3 | — | — |
| | `sozlamalar/xodimlar` | Xodimlar | 1,2 | 0007, 0008, 0026 | — |
| | `sozlamalar/tolov-sozlamalari` | To'lov sozlamalari | 1,2 | — | — |
| | `sozlamalar/sabablar-va-pauza` | Sabablar va pauza sozlamasi | 1,2,3 | 0013, 0023 | — |
| | `sozlamalar/arxiv` | Arxiv | 1 | — | — |
| DaF ilovasi | `daf-ilova/ilova-faolligi` | Ilova faolligi | 1,2,3 | 0009, 0014, 0019, 0020, 0024 | — |
| | `daf-ilova/media` | Media | 1,2,3 | — | — |

Texnik ADR'lar (qo'llanmaga kirmaydi, sababi `texnik-adrlar.ts` da): 0003
(route manifesti), 0011 (o'quv o'zagi standarti).

Qo'shimcha sahifa: `/qollanma/yangiliklar` — «Nima yangi».

Klientda ishlamaydigan joylar qo'llanmaga «ishlaydi» deb yozilmaydi
(tahlilda topilgan: kassirga «Guruhlar» menyusi ko'rinadi, server rad etadi;
kassirga qarzdorlikdagi ba'zi amallar; bo'sh `/reports/graduates` va h.k.).
Ular alohida vazifaga ajratildi.

## Sahifa shablonlari

**Qoida sahifasi** (masalan, guruhdan chiqarish):

1. Qisqacha — 1–2 gap. MDX'da yozilmaydi: reyestrdagi `qisqacha` sarlavha
   ostida blok bo'lib chiziladi (qidiruv natijasi ham shu matnni ko'rsatadi).
2. Qanday ishlaydi — qadamlar yoki diagramma.
3. Misol — raqam bilan, soxta ism bilan.
4. Istisnolar.
5. Kim qila oladi.
6. Tizimda qayerda — sahifa yoki tugma nomi, havola bilan.

**Amal sahifasi** (masalan, to'lov qayd qilish): raqamlangan skrinshot, ostida
shu raqamlar bilan izoh, keyin qadamlar va «Ko'p uchraydigan xatolar».

**Yozish qoidalari:**

- Oddiy o'zbek tili (lotin). Bitta gapda bitta fikr.
- UI yozuvlari «...» ichida, ekrandagidek: «Guruhdan chiqarish», «To'lov qayd qilish».
- Kod nomi yo'q (`STUDENT_CANCELLED` emas, «O'quvchi o'zi to'xtatdi»).
- Sanaga bog'liq qoida sanasi bilan: «01.10.2026 dan ketganlarga».
- Raqamlar faqat misol sifatida; haqiqiy summa, ism, telefon yo'q.
- Manba — kod. ADR va `CLAUDE.md` bir-biriga zid bo'lsa, kod bo'yicha yoziladi.

## Texnik dizayn

### Fayllar

```
client/
  next.config.ts                      createMDX (remark-gfm, satr nomi bilan — Turbopack)
  src/mdx-components.tsx              MDX elementlari → Tailwind uslubi; mermaid → <Diagramma>
  src/qollanma/
    bolimlar.ts                       bo'limlar: id, nom, tartib, icon
    sahifalar.ts                      reyestr — yagona manba (pastda)
    yangiliklar.ts                    «Nima yangi» yozuvlari
    texnik-adrlar.ts                  qo'llanmaga kirmaydigan ADR'lar + sabab
    qidiruv.ts                        qidiruv (sof funksiya)
    yol-moslash.ts                    pathname → sahifa (sof funksiya)
    rol-filtri.ts                     rolga qarab bo'lim/sahifa (sof funksiya)
    kontent/<bolim>/<sahifa>.mdx      matn
    *.test.ts                         invariant testlar
  src/components/qollanma/            layout, menyu, qidiruv, «?» tugmasi, Sheet,
                                      Diagramma, Skrinshot, Eslatma,
                                      yangiliklar ro'yxati va belgisi
  src/app/(dashboard)/qollanma/
    layout.tsx                        ichki menyu + kontent
    page.tsx                          bosh sahifa: rol bo'yicha kirish, bo'limlar, yangiliklar
    [bolim]/[sahifa]/page.tsx         sahifa (generateStaticParams, dynamicParams=false)
    yangiliklar/page.tsx              «Nima yangi»
  public/qollanma/rasmlar/<bolim>/*.png   skrinshotlar
  scripts/qollanma-skrinshot.mjs      Playwright skripti + kadrlar ro'yxati
server/scripts/
  qollanma-muhit.ts                   daf_docs stsenariysi (pastda)
  qollanma-api.sh                     API'ni daf_docs va o'chirilgan integratsiyalar bilan ishga tushiradi
```

### Kontent formati

MDX, `@next/mdx` orqali (rasmiy yo'l; Next 16 hujjati: `mdx-components.tsx`
majburiy, Turbopack'da plaginlar satr nomi bilan beriladi). Sahifa
`import(\`@/qollanma/kontent/${bolim}/${sahifa}.mdx\`)` bilan yuklanadi —
Next hujjatidagi dinamik import naqshi, `generateStaticParams` bilan build
paytida tayyorlanadi.

MDX ichida ishlatiladigan komponentlar (hammasi `mdx-components.tsx` orqali,
import yozilmaydi):

- `<Eslatma tur="diqqat|malumot">` — ogohlantirish va izoh.
- `<Skrinshot src alt />` — rasm, bosilsa to'liq o'lchamda ochiladi.
- ` ```mermaid ` bloki — `<Diagramma>` ga aylanadi (klient komponenti,
  `mermaid` faqat kerak bo'lganda yuklanadi, yorug'/qorong'i mavzuga moslanadi).
- Jadvallar — GFM (`remark-gfm`).

Sarlavha (h1), qisqacha bloki, «Yangilandi» sanasi va «Kimlar uchun» qatori
MDX'da emas, reyestrdan chiziladi — har biri bitta joyda turadi.

`@tailwindcss/typography` qo'shilmaydi: elementlar uslubi `mdx-components.tsx`
da, loyihadagi shadcn tokenlari bilan.

### Reyestr (`sahifalar.ts`)

Har sahifa uchun bitta yozuv — menyu, qidiruv, rol filtri, «?» tugmasi va
ADR testi shu ro'yxatdan o'qiydi:

```ts
interface QollanmaSahifa {
  bolim: string;         // "oquvchilar"
  sahifa: string;        // "guruhdan-chiqarish"
  sarlavha: string;      // "Guruhdan chiqarish va pul"
  qisqacha: string;      // 1–2 gap — sahifa boshi, qidiruv natijasi, «?» Sheet
  rollar: number[];      // [1, 2, 3]
  adr: string[];         // ["0043", "0044"]
  yollar: string[];      // ERP marshrutlari: ["/students/profile/*"] — «?» uchun;
                         // aniq yo'l yoki oxirida "/*" (bir yoki bir nechta segment),
                         // query parametrlari hisobga olinmaydi
  kalitSozlar: string[]; // qidiruv uchun qo'shimcha so'zlar
  yangilangan: string;   // "2026-09-30"
}
```

MDX fayl reyestrni takrorlamaydi. Reyestr bilan fayllar mosligini test
tekshiradi.

### Marshrutlar va menyu

- Chap menyuga «Qo'llanma» qo'shiladi (`nav-items.ts`, `visibleForRoles` yo'q —
  hamma xodim ko'radi, ustoz ham).
- `/qollanma` ichida chap tomonda bo'limlar ro'yxati (rol bo'yicha filtrlangan),
  telefonda ro'yxat Sheet'ga yig'iladi.
- Breadcrumb: `breadcrumb-routes.ts` ga faqat `qollanma`; bo'lim va sahifa
  nomlari reyestrdan `useBreadcrumbName` bilan (60 ta statik yozuv qo'shilmaydi).
- Qidiruv — `?q=` URL'da (klient qoidasi: filtr holati URL'da). Sarlavha,
  qisqacha va kalit so'zlar bo'yicha; apostrof turlari (o', oʻ, o‘, o’)
  bir xil hisoblanadi. To'liq matn indeksi — sahifalar 60 dan oshsa.

### «?» tugmasi

`DashboardHeader` o'ng guruhiga bitta tugma. `usePathname()` reyestrdagi
`yollar` bilan solishtiriladi; mos sahifa bo'lsa va sahifa foydalanuvchi
roliga tegishli bo'lsa, tugma ko'rinadi. Bosilganda o'ng tomondan Sheet
ochiladi (`sm:max-w-2xl`, loyihaning Sheet shabloni: qotgan sarlavha, aylanadigan
tana), MDX dangasa yuklanadi, tepada «To'liq sahifada ochish». `/qollanma`
ichida tugma chiqmaydi. Bir ERP sahifasiga bir nechta qo'llanma sahifasi mos
kelsa — reyestr tartibida birinchisi ochiladi, Sheet pastida qolganlari havola
sifatida.

### «Nima yangi»

`yangiliklar.ts`: `{ sana, sarlavha, matn, rollar?, sahifa? }`. Sahifa rolga
qarab filtrlaydi, eng yangisi tepada. Chap menyudagi «Qo'llanma» yonida
o'qilmagan yozuvlar soni: oxirgi ko'rilgan sana `localStorage` da
(`try/catch` bilan; o'qib bo'lmasa belgi chiqmaydi, sahifa ishlayveradi).
Qiymat hali yo'q bo'lsa (birinchi kirish) — oxirgi 14 kundagi yozuvlar
sanaladi. «Nima yangi» sahifasi ochilganda qiymat eng yangi yozuv sanasiga
o'rnatiladi.
Foydalanuvchiga ko'rinadigan har o'zgarish shu faylga bitta yozuv qo'shadi.

### Yangi paketlar

| Paket | Nega |
|---|---|
| `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx` | Next'ning rasmiy MDX yo'li |
| `remark-gfm` | Jadvallar |
| `mermaid` | Diagrammalar; faqat qo'llanma sahifasida dangasa yuklanadi |
| `playwright` (dev) | Skrinshot skripti; brauzer `~/Library/Caches/ms-playwright` da bor |

Grafik kutubxonasi qo'shilmaydi (loyiha qoidasi: grafik faqat recharts);
Mermaid — grafik emas, oqim diagrammasi.

## Skrinshot quvuri

Qo'lda skrinshot olinmaydi — rasm eskirganda skript qayta ishga tushiriladi.

**1. Baza — `daf_docs`.** Lokal docker Postgres (`localhost:5433`), mavjud
`daf_erp` bazasidan alohida. Sxema `prisma db push` bilan (migratsiyalar bo'sh
bazada to'xtaydi: `20260805120000_branch_tenancy_leads_holidays_mock` `Company`
yozuvini kutadi). Keyin `prisma/seed.ts` (seed bazani avval to'liq tozalaydi).

**2. Stsenariy — `server/scripts/qollanma-muhit.ts`.** Seed faqat dars paketi
kurslarini yaratadi va ketish sabablari bo'sh. Skript qo'llanmaga kerak
holatlarni yaratadi: bir kursni oylik to'lovga o'tkazadi, yozilishlarning
`startDate` ini oy boshiga qo'yadi, joriy oy hisobini `MonthlyChargeService`
orqali yaratadi (`scripts/migrate-to-monthly.ts` dagi `MigrationModule`
naqshi, AppModule'siz), ketish sabablarini
`scripts/seed-default-exit-reasons.ts` bilan qo'shadi, qarzdor o'quvchi va
shu oyning davomatini ta'minlaydi. Mavjud skriptlar qayta ishlatiladi, yangisi
yozilmaydi.

**Himoya (fail-closed):** stsenariy `DATABASE_URL` aynan
`localhost:5433/daf_docs` bo'lmasa ishlamaydi. `server/.env` bulutdagi Neon
bazasiga ulangan — himoyasiz skript o'shanga yozib yuborardi.

**3. API — `server/scripts/qollanma-api.sh`.** `daf_docs` bilan,
`CRONS_ENABLED=false`, bo'sh qilingan: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_ADMIN_BOT_TOKEN`, `TELEGRAM_MINI_APP_URL`, `ESKIZ_*`, `VAPID_*`.
Bot tokeni bo'sh bo'lmasa, Telegraf `deleteWebhook` chaqirib production bot
webhook'ini buzadi. Ishga tushishdan oldin lokal Redis tozalanadi (`daf_erp`
bilan umumiy, kalit prefiksi yo'q).

**4. Suratga olish — `client/scripts/qollanma-skrinshot.mjs`.** Playwright:

- faqat `http://localhost:3000` ga ulanadi, boshqa manzilda to'xtaydi;
- `POST /api/auth/login` bilan kiradi (seed foydalanuvchisi), `token`,
  `refreshToken`, `user` cookie'larini qo'yadi;
- yorug' mavzu (`localStorage.theme = "light"`), 1280×800, `deviceScaleFactor: 2`;
- har kadr: sahifani ochadi, kerak bo'lsa oynani ochadi (tasdiqlash tugmasi
  hech qachon bosilmaydi), elementlar ustiga raqamli belgilar qo'yadi
  (selektor bo'yicha — koordinata emas), elementni yoki hududni kesib
  `public/qollanma/rasmlar/<bolim>/<nom>.png` ga saqlaydi;
- kadrlar ro'yxati skript ichida.

**Sana cheklovi.** Server «bugun»ni `new Date()` dan oladi. Oylik hisob
suratga olinadigan oyda yaratiladi. Shartnoma 6.2 (`CONTRACT_62_START_DAY`)
01.10.2026 dan ishlaydi — «Guruhdan chiqarish» kadri shu sanadan keyin olinadi.

CI'da ishlamaydi (Docker kerak). Ekran o'zgarganda qo'lda: tartibi
`client/CLAUDE.md` da yoziladi.

## Eskirmaslik

**Testlar (vitest, `src/qollanma/*.test.ts`):**

1. **ADR qamrovi.** `docs/adr/0*.md` dagi har ADR yo bitta sahifaning `adr`
   ro'yxatida, yo `texnik-adrlar.ts` da (sabab bilan) bo'lishi shart; ikkalasida
   bir vaqtda emas; mavjud bo'lmagan ADR'ga havola yo'q. Yangi ADR qo'llanmasiz
   qo'shilsa, CI yiqiladi.
2. **Reyestr ↔ fayllar.** Har yozuvning MDX fayli bor; ortiqcha MDX yo'q;
   slug'lar takrorlanmaydi; har `bolim` `bolimlar.ts` da bor; sana formati.
3. **Rasmlar.** MDX'dagi har `/qollanma/rasmlar/...` fayli `public/` da bor.
4. **Yo'llar.** Har `yollar` naqshi `src/app/(dashboard)` dagi mavjud
   marshrutga mos keladi (`launch-targets.test.ts` naqshi).
5. **Sof funksiyalar.** Qidiruv, yo'l moslash, rol filtri.

**Jarayon:**

- `docs/adr/README.md` ga qadam: «Foydalanuvchiga ko'rinadigan qaror —
  shu PR'da qo'llanma sahifasi va `yangiliklar.ts`; texnik — `texnik-adrlar.ts`».
- `client/CLAUDE.md` ga «User guide (Qo'llanma)» bo'limi (inglizcha).
- `server/CLAUDE.md` ga bitta qator: xatti-harakat o'zgarsa, qo'llanma ham.

## Tekshiruv

- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (klient).
- Server skriptlari uchun `npm run typecheck`, `npx eslint`, `npx prettier --write`.
- Brauzerda seed foydalanuvchilari bilan: `ceo`, `bd1`, `admin1`, `kassir1` va
  bitta ustoz — menyu, qidiruv, «?» va rol filtri har rolda to'g'ri.
- Har kontent sahifasi manbasi bilan solishtiriladi (ADR, kod) — alohida
  tekshiruv qadami. Noto'g'ri qo'llanma qo'llanmasizlikdan yomonroq.

## Doiradan tashqari

- Rus tili, to'liq matnli qidiruv indeksi, video/GIF.
- Dialog ichidagi «?» havolalari (sarlavhadagi tugma yetadi; kerak bo'lsa keyin).
- Sahifaga izoh yoki baho qoldirish.
- Ochiq sayt, server tomonidagi rol cheklovi.
- Skrinshotlarni CI'da avtomatik olish.

## Xavflar

| Xavf | Chora |
|---|---|
| Kontentda xato | Har sahifa manba bilan tekshiriladi; zid manbalarda kod bo'yicha |
| Turbopack + MDX dinamik import | Birinchi vazifa: `dev` va `build` da tekshirish |
| Mermaid hajmi | Faqat diagrammali sahifada dangasa yuklanadi |
| Skrinshot eskiradi | Skript qayta ishga tushiriladi; rasm ro'yxati testda |
| Lokal muhit production'ga tegadi | Stsenariy himoyasi, bo'sh kalitlar, faqat localhost |
| Kontent hajmi (53 sahifa) | Bo'limlar bo'yicha vazifalar; birinchi navbatda 01.10 dan kuchga kiradigan qoidalar |

## Eski hujjat

`docs/moliya-qollanma.html` va `.pdf` yangi «To'lovlar» va «Ustoz oyligi»
bo'limlari tayyor bo'lgach o'chiriladi (git tarixida qoladi). Merge'dan oldin
foydalanuvchidan so'raladi.

## Bajarish tartibi

1. Poydevor: MDX, reyestr, marshrutlar, menyu, breadcrumb, testlar.
2. Komponentlar: Qisqacha, Eslatma, Skrinshot, Diagramma, qidiruv, «?» Sheet,
   «Nima yangi» va belgisi.
3. Jarayon qoidalari: ADR README, `client/CLAUDE.md`, `server/CLAUDE.md`.
4. Skrinshot quvuri: muhit, API skripti, Playwright skripti.
5. Kontent, bo'limma-bo'lim: Boshlash (lug'at bilan) → O'quvchilar →
   To'lovlar → Davomat → Guruhlar → Ustoz oyligi → Hisobotlar → Xarajatlar →
   Lidlar → Mock → Telegram → Sozlamalar → DaF ilovasi → Nima yangi.
6. Skrinshotlar (01.10.2026 dan keyin «Guruhdan chiqarish»).
7. Yakuniy tekshiruv, eski hujjatni olib tashlash, PR (foydalanuvchi ruxsati bilan).
