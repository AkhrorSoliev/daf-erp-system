# Telegram shaxsiy hisobot — CEO tanlagan odamlarga, tanlagan ko'rinishda

Sana: 16.10.2026. Holat: CEO tasdiqladi (suhbatda bosqichma-bosqich, quyidagi
«Qarorlar» bo'limi).
Tarmoq: `feat/ceo-telegram-hisobot`.

## Maqsad

Bot kunlik hisobotni guruhlarga emas, **CEO tanlagan odamlarning shaxsiy
chatiga** yuborsin. Kimga, qaysi filiallar, qaysi bo'limlar, qaysi ko'rinishda
va soat nechada borishini CEO saytda o'zi belgilaydi. Oluvchi hisobotni botdagi
menyudan istalgan payt ham so'ray oladi.

21:00 dagi guruh hisoboti o'zgarmaydi.

## Qarorlar (CEO, 16.10.2026)

| # | Savol | Javob |
|---|---|---|
| 1 | Nima sozlanadi | Ko'rinish ham, bo'limlar ham — sozlamada |
| 2 | Ko'rinishlar | 4 tasi: bo'lim bo'yicha, jadval, filial bo'yicha, faqat jami |
| 3 | Kimga | Oluvchilarni CEO tanlaydi (xodimlar) |
| 4 | Sozlama | Har oluvchi uchun alohida: filiallar, bo'limlar, ko'rinish, vaqt |
| 5 | Vaqt | Har oluvchi uchun o'zi, yarim soat qadam; xabarda «HH:MM holati» |
| 6 | Yakshanba / bayram | Avtomatik bormaydi; menyudan so'rash ishlaydi |
| 7 | Filial tugmalari | Sozlamada «Barcha filiallar»; botda filial / «Barchasi» / «Yangilash» |
| 8 | Ichki tuzilish | Raqamlar 21:00 hisobotining manbaidan; tasdiqlandi |

## 1. Sozlamalar sahifasi

**Joyi:** Sozlamalar → «Telegram hisobot» (`/settings/telegram-report`).
Faqat CEO ko'radi va o'zgartiradi (server: `@CeoOnly()`, mijoz: sahifa va
menyu bandi faqat CEO'ga).

**Oluvchilar ro'yxati.** Har qator:

- ism, lavozim;
- Telegram holati: ✅ ulangan / ⚠️ ulanmagan («Hisobot bormaydi —
  `/xodim` orqali ulanishi kerak»). Ulanganlik bot qoidasi bilan bir xil:
  `staffChatOf` (bitta chatda ikki xodim bo'lsa — ulanmagan);
- **vaqt** — 07:00–23:30, yarim soat qadam; yangi oluvchida 21:00;
- **ko'rinish** — 4 tadan biri (2-bo'lim);
- **filiallar** — «Barcha filiallar» katakchasi yoki bitta-bitta filial.
  «Barcha filiallar» keyin ochilgan filialni ham o'z ichiga oladi;
- **bo'limlar** — 8 ta katakcha (3-bo'lim);
- **yoqilgan / o'chirilgan** — vaqtincha to'xtatish;
- **«Hozir sinab ko'rish»** — hisobot shu zahoti shaxsiy chatga ketadi
  (kunlik «yuborildi» belgisiga tegmaydi).

**«+ Oluvchi qo'shish»** — faqat xodim (rollar 1–5, faol, arxivlanmagan).
Bir xodim ro'yxatda bir marta. Yangi oluvchining boshlang'ich sozlamasi:
vaqt 21:00, ko'rinish «bo'lim bo'yicha», filiallar = xodimning o'z filiallari
(`mainBranch` ∪ `UserBranch`; CEO bo'lsa «Barcha filiallar»), bo'limlar = pul
bo'lmaganlari (O'quvchilar, Darslar, Faol o'quvchilar, Diqqat).

**Olib tashlash** — qator o'chadi (sozlama, moliyaviy yozuv emas). Tarixda
qoladi (`EntityHistory`).

Filial tanlash CEO qarori: oluvchiga xodimning o'z filiali bo'lmagan filial
ham berilishi mumkin. Tizim buni cheklamaydi, faqat sahifa xodimning o'z
filialini belgilab ko'rsatadi.

## 2. Ko'rinishlar

Hammasi bitta raqamlar to'plamidan yoziladi (4-bo'lim). Misollar ikki filial
uchun; filial bitta bo'lsa «jami» qatori/ustuni chiqmaydi.

**`BY_SECTION` — bo'lim bo'yicha**
```
📊 16.10 — 18:30 holati
💰 Tushum: Farg'ona 4,2 · Namangan 0,8 · jami 5,0 mln
👥 Yangi: Farg'ona +3/−1 · Namangan +1/0
🎓 Davomat: Farg'ona 91% · Namangan 88%
📌 Qarz: Farg'ona 27,7 · Namangan 1,2 · jami 28,9 mln
```

**`TABLE` — jadval** (`<pre>` blok, raqamlar o'ngga tekislanadi)
```
            Farg'ona  Namangan   Jami
Tushum         4,2       0,8      5,0
Xarajat        0,3       0,0      0,3
Yangi/ketdi   +3/−1     +1/0    +4/−1
Davomat        91%       88%      90%
Qarz          27,7       1,2     28,9
```
Matnli qatorlar («Diqqat») jadval tagida oddiy matn bo'lib chiqadi. Filial
nomi 9 belgidan uzun bo'lsa qisqartiriladi (`Farg'ona…`).

**`BY_BRANCH` — filial bo'yicha**
```
🏢 Farg'ona
💰 4,2 mln · 👥 +3/−1 · 🎓 91% · 📌 qarz 27,7
🏢 Namangan
💰 0,8 mln · 👥 +1/0 · 🎓 88% · 📌 qarz 1,2
Σ Jami: 💰 5,0 · 📌 28,9 mln
```

**`TOTAL_ONLY` — faqat jami** (filiallarga bo'lmaydi)
```
📊 16.10 — 💰 5,0 mln · 👥 +4/−1 · 🎓 90% · 📌 qarz 28,9 mln
📅 Oy: tushum 160 mln · sof foyda 32 mln
```

**Umumiy qoidalar:**

- Sarlavha har doim `📊 DD.MM — HH:MM holati`.
- Summalar mln ga, bir kasr bilan (`4,2`); 100 mingdan kam summa so'mda
  (`85 000`). Bitta yordamchi, uchala ko'rinish o'shani ishlatadi.
- Qiymati yo'q qator (masalan, bugun dars yo'q) yashirinadi; hamma bo'lim
  bo'sh bo'lsa «Bugun ma'lumot yo'q».
- Xabar 4096 belgidan oshsa bo'linmaydi — ko'rinish ixcham bo'lgani uchun
  oshmaydi; oshsa (filial juda ko'p) oxiri «…» bilan kesiladi va log yoziladi.

## 3. Bo'limlar

| Kalit | Bo'lim | Ichida | Pul |
|---|---|---|---|
| `TODAY_MONEY` | 💰 Bugungi pul | tushum, xarajat | ha |
| `STUDENTS` | 👥 O'quvchilar | yangi / ketdi, yangi lid | yo'q |
| `LESSONS` | 🎓 Darslar | dars soni, davomat % | yo'q |
| `ACTIVE_STUDENTS` | 👤 Faol o'quvchilar | soni | yo'q |
| `DEBT` | 📌 Qarz | o'qiyotganlar qarzi + ▲/▼, o'qimayotganlar qarzi | ha |
| `MONTH` | 📅 Oy boshidan | tushum, xarajat, sof foyda; oylik hisob oyida «hisoblandi / to'landi / qoldi» | ha |
| `SALARY` | 💵 Ustozlar oyligi | hisoblangan, markaz qo'shimchasi | ha |
| `ALERTS` | 🚩 Diqqat | 21:00 hisobotidagi bayroqlar | yo'q |

Har bir raqam 21:00 hisobotidagi qator bilan **bir xil manbadan** olinadi:

- qarz — `ReportsService.getDebtSplit` (ADR-0059): ikki son, hech qachon
  qo'shilmaydi. ▲/▼ faqat o'qiyotganlar qarzi uchun, filialning kechagi
  `DailyFinancialSnapshot` qatoriga nisbatan;
- sof foyda — `getMonthlyNetProfit`; oylik hisob oyi (2026-09 dan) —
  `getMonthCharges` (ADR-0058); undan oldingi oy — «Oy oxiriga kutilyapti»;
- oylik — `SalaryMonthlyService.getMonthly` totals;
- lid soni — `leadAttributionWhere` (filialsiz lid hech bir filialga
  qo'shilmaydi, faqat «jami»da).

Ko'rinishga qarab bo'limdagi raqamlarning bir qismi chiqmasligi mumkin
(`TABLE` faqat raqamli qatorlarni oladi) — lekin hech bir ko'rinish o'zi
yangi raqam hisoblamaydi.

## 4. Raqamlar qayerdan keladi

Hozir `TelegramGroupDailyReportService.build(companyId, branchIds)` raqamlarni
yig'adi va shu joyda matnni yozadi. U ikkiga bo'linadi:

1. **`collect(companyId, branchIds, now)` → `DailyReportData`** — barcha
   so'rovlar, natija tipli obyekt (matnsiz).
2. **`renderGroupMessage(data)`** — hozirgi 21:00 matni, harfma-harf o'zi.

`build()` = `collect` + `renderGroupMessage`, chaqiruvchilar uchun o'zgarmaydi.
Guruh xabari o'zgarmaganini test qo'riqlaydi: bo'lishdan oldin bir nechta
holat uchun `build()` natijasi yozib olinadi, bo'lingandan keyin aynan shu
matn chiqishi talab qilinadi.

Shaxsiy hisobot uchun bir oluvchiga `collect` har ruxsat berilgan filial uchun
alohida (`[id]`) va «jami» uchun shu filiallar ro'yxati bilan bir marta
chaqiriladi. «Jami» filiallarni qo'shib chiqarilmaydi — o'z so'rovi bilan
olinadi, shunda filiallar yig'indisi va jami bir xil qoidaga bo'ysunadi
(sof foyda kabi qo'shilmaydigan raqamlar ham to'g'ri chiqadi).

**Bir martalik hisob.** Bir yuborish davrida (masalan 21:00 da 3 oluvchi)
`collect` natijasi `(companyId, filiallar ro'yxati)` kaliti bilan xotirada
saqlanadi va shu davrda qayta ishlatiladi. Davr tugagach tashlanadi. Menyudan
so'rash har safar yangi hisoblaydi.

`DailyReportData` 8 bo'limni to'liq qamraydi; tanlanmagan bo'lim so'rovlari
ham bajariladi (`collect` bitta), faqat chiqmaydi. Har bo'lim uchun alohida so'rov — kerak bo'lsa keyin.

## 5. Ma'lumot modeli

```prisma
enum TelegramReportLayout { BY_SECTION TABLE BY_BRANCH TOTAL_ONLY }
enum TelegramReportSection {
  TODAY_MONEY STUDENTS LESSONS ACTIVE_STUDENTS DEBT MONTH SALARY ALERTS
}

model TelegramReportRecipient {
  id           Int                     @id @default(autoincrement())
  companyId    Int
  userId       Int
  sendTime     String                  // "HH:MM", :00 yoki :30, 07:00–23:30
  layout       TelegramReportLayout    @default(BY_SECTION)
  allBranches  Boolean                 @default(false)
  branchIds    Int[]
  sections     TelegramReportSection[]
  isActive     Boolean                 @default(true)
  lastSentDate DateTime?               @db.Date   // Toshkent kuni
  createdById  Int
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt
  @@unique([companyId, userId])
}
```

Bitta migratsiya (`ADD`/`CREATE` faqat, mavjud jadvalga tegmaydi).
`EntityHistory` `entityType: 'TelegramReportRecipient'` bilan yoziladi.

**Ruxsat berilgan filiallar** har o'qishda hisoblanadi: `allBranches` bo'lsa
kompaniyaning tirik (`deletedAt: null`) filiallari, aks holda `branchIds` ∩
tirik filiallar. Bo'sh chiqsa hisobot yuborilmaydi va sahifada ⚠️ «Filial
tanlanmagan».

## 6. Yuborish

**Cron** `TelegramReportCronService`, `@Cron('0 0,30 7-23 * * 1-6')` Toshkent:

1. Yakshanba bo'lsa — chiqadi. Kompaniya bo'yicha bayram
   (`findActiveHolidayCovering(now, null)`) bo'lsa — chiqadi.
2. Vaqti shu yarim soatga teng, `isActive`, `lastSentDate` bugun emas
   oluvchilar.
3. Har oluvchi uchun alohida `try/catch` (biri yiqilsa qolganlari ketadi):
   oluvchi tekshiruvi (pastda) → raqamlar → matn → yuborish.
4. Yuborilgandan keyin `lastSentDate = bugun` — shartli `updateMany`
   (`lastSentDate` hali bugun emas bo'lsa), shuning uchun ikki nusxa server
   bir paytda ishlasa ham bitta xabar ketadi: yozish yuborishdan **oldin**
   «band qilish» sifatida qilinadi; yuborish vaqtinchalik xato bilan yiqilsa
   belgi qaytariladi (keyingi yarim soatda qayta urinadi), doimiy xato
   (bot bloklangan) bo'lsa belgi qoladi va log yoziladi.

**Oluvchi tekshiruvi** (cron, «Hozir sinab ko'rish», menyu va tugmalar —
hammasi bitta funksiya): qator `isActive`; xodim tirik, `status` ACTIVE,
`isActive`, rollardan biri 1–5; chat `staffChatOf` bo'yicha shu odamniki;
ruxsat berilgan filiallar bo'sh emas.

**Yuboruvchi** — asosiy bot (`TelegramService.getBot()`), shaxsiy chat. Bu
ADR-0025 ning «darhol» ro'yxatiga yangi qo'shimcha: `direct-send.guard.spec.ts`
ruxsat ro'yxatiga yangi fayl yoziladi va ADR (8-bo'lim) buni qayd qiladi.
Xatolar `classifyTelegramError` bo'yicha.

## 7. Bot

**Menyu.** `staffMenuKeyboard`ga «📊 Hisobot» qatori (`callback_data: tr:open`)
— faqat oluvchilar ro'yxatida faol qatori bor xodimda. Menyu `/start` da
quriladi, shuning uchun yangi qo'shilgan oluvchi tugmani keyingi `/start` dan
keyin ko'radi; «Hozir sinab ko'rish» bilan kelgan hisobotda tugmalar baribir
bor.

**Hisobot tagidagi tugmalar:**
```
[ Farg'ona ] [ Namangan ] [ 🌐 Barchasi ]
[ 🔄 Yangilash ]
```

- `callback_data`: `tr:b:<branchId>`, `tr:all`, `tr:r:<branchId|all>`
  (64 baytdan kam).
- Ruxsat berilgan filial bitta bo'lsa filial qatori chiqmaydi.
- Tugma bosilganda: chat egasi aniqlanadi (`staffOfChat`), uning faol qatori
  topiladi, so'ralgan filial ruxsat berilganlar ichida ekani tekshiriladi;
  bo'lmasa «Bu hisobot sizga ochiq emas» va tugmalar olib tashlanadi.
- Javob — o'sha xabar tahrirlanadi (`editMessageText`), yangi xabar emas.
  Bitta filial tanlanganda ko'rinish o'sha filialning o'zi (jami qatori
  yo'q); sarlavha «HH:MM holati» yangi vaqt bilan.
- «message is not modified» — «O'zgarish yo'q» deb javob beriladi.
- Ikki marta tez bosish: chat bo'yicha «jarayonda» to'plami (sinxron qo'shish,
  `finally` da olib tashlash), ikkinchisiga «Kuting…».
- Ro'yxatga ulanish `TelegramService.useBeforeScenes` orqali (topshiriqlar
  kabi), boshqa yangilanishlar `next()` bilan o'tadi.

## 8. Server yo'llari

Hammasi `@CeoOnly()`, `COMPANY_WIDE` (route manifest):

| Yo'l | Ish |
|---|---|
| `GET /telegram-report/recipients` | ro'yxat + Telegram holati + ruxsat berilgan filiallar |
| `GET /telegram-report/candidates` | qo'shish mumkin bo'lgan xodimlar |
| `POST /telegram-report/recipients` | qo'shish (`userId`), boshlang'ich sozlama bilan |
| `PATCH /telegram-report/recipients/:id` | vaqt, ko'rinish, filiallar, bo'limlar, faollik |
| `DELETE /telegram-report/recipients/:id` | olib tashlash |
| `POST /telegram-report/recipients/:id/test` | hozir yuborish |

DTO tekshiruvlari: `sendTime` `^(0[7-9]|1\d|2[0-3]):(00|30)$`; `branchIds`
kompaniyaning tirik filiallari; `sections` kamida bitta; `allBranches` true
bo'lsa `branchIds` e'tiborsiz (bo'sh saqlanadi).

`/test` javobi: `{ sent: true }` yoki aniq sabab bilan 400 («Telegram
ulanmagan», «Filial tanlanmagan», «Botga xabar yetmadi»).

## 9. ADR

**ADR-0094** «Kunlik hisobot shaxsiy chatga: CEO oluvchi, filial va bo'limni
belgilaydi». Ichida:

- moliyaviy raqamlar endi guruhdan tashqari shaxsiy chatga ham boradi; kim
  nimani ko'rishini faqat CEO belgilaydi (`@CeoOnly`, imkoniyat emas);
- filial ruxsati xodimning o'z filiali bilan cheklanmaydi (CEO qarori);
- ADR-0025 «darhol» ro'yxatiga yangi jo'natuvchi;
- yakshanba/bayram qoidasi; bir kunda bir avtomatik xabar;
- raqamlar 21:00 hisobotining `collect` qismidan — boshqa joyda hisoblanmaydi.

ADR shu PR'da, `docs/adr/README.md` indeksiga qo'shiladi.

## 10. Testlar

- `renderGroupMessage(collect(...))` — bo'lishdan oldingi `build()` matni
  bilan aynan bir xil (bir nechta holat: bo'sh kun, oylik hisob oyi, foyda
  xatosi bilan).
- 4 ko'rinish: har biri 1 va 2 filial bilan, bo'lim tanlovi bilan; bo'sh
  qatorlar yashirinishi; jadval tekislanishi.
- Cron: vaqt mos kelmasa yubormaydi; yakshanba / bayram; `lastSentDate`
  bilan ikkinchi marta yubormaydi; biri yiqilsa qolganlari ketadi;
  vaqtinchalik xatoda belgi qaytariladi.
- Oluvchi tekshiruvi: nofaol / arxiv / bloklangan xodim, ulanmagan chat,
  ikki xodimli chat, bo'sh filial ro'yxati.
- Tugmalar: ruxsatsiz filial rad; ro'yxatdan chiqarilgan odam; boshqa
  chatdan bosish; «not modified».
- Controller: har yo'l `@CeoOnly()` (`routeAccess`), route manifest qatori.
- `direct-send.guard.spec.ts` yangi fayl bilan yashil.

## 11. Kirmaydi

- O'tgan kun hisoboti (qarz kabi raqamlar faqat «hozir» uchun to'g'ri).
- Direktor yoki admin o'zi o'z sozlamasini o'zgartirishi.
- Har bo'lim uchun alohida so'rov (4-bo'lim).
- Filialning o'z bayramida o'sha filialni yashirish (kompaniya bayrami
  bo'yicha butun hisobot to'xtaydi; filial bayrami hisobotga ta'sir qilmaydi —
  21:00 hisoboti kabi).
- Excel yoki fayl yuborish (guruhdagi «Ko'proq imkoniyatlar» menyusi bor).
