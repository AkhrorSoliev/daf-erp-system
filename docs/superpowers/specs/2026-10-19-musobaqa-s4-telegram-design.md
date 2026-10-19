# Musobaqa tizimi — S4: Telegram eslatma va dushanba xulosasi — dizayn

**Sana:** 2026-10-19
**Bog'liq:** [S1](2026-10-18-musobaqa-s1-poydevor-design.md) (`DafStudentDay`),
[S2](2026-10-18-musobaqa-s2-shaxsiy-osish-design.md) (`DafStudentSetting`, nishonlar, seriya),
[S3](2026-10-18-musobaqa-s3-liga-design.md) (liga, `DafGroupWeek`),
ADR-0025 (Telegram: 20:00 xulosa yoki «darhol» ro'yxati), ADR-0066 (uzilgan chat)

Prodda mashq qilgan 102 o'quvchidan 64 tasi faqat bir kun mashq qilgan:
asosiy muammo — qaytib kelmaslik. S4 o'quvchini Telegram'da ikki xil
yumshoq xabar bilan qaytaradi: **kechki eslatma** (bugun hali mashq
qilmagan faol o'quvchiga) va **dushanba xulosasi** (o'tgan hafta natijasi).

CEO qarorlari (2026-10-19): eslatma faol o'quvchiga, kuniga ko'pi bilan
bitta (19:30), haftada 4 tagacha; dushanba 09:00 hafta xulosasi;
o'quvchi ikki joydan o'chira oladi; xabar matnlari avval CEO Telegram'ida
ko'riladi.

---

## 1. Kechki eslatma

### 1.1 Kim oladi

Hammasi shart (har kuni 19:30 Asia/Tashkent, yakshanba va umumiy bayram
kunlarida yo'q):

| Shart | Manba |
| --- | --- |
| O'quvchi o'chirilmagan (`deletedAt IS NULL`), botga ulangan (`telegramChatId`), chat uzilmagan (`telegramDisconnectedAt IS NULL`) | `Student` |
| Eslatmalar yoqilgan (`remindersEnabled`, standart `true`) | `DafStudentSetting` |
| Oxirgi 14 kunda (bugungidan tashqari) kamida bitta kunlik qator bor | `DafStudentDay` |
| **Bugun** hech qanday qator yo'q (mashq qilmagan; nol ballik urinish ham mashq) | `DafStudentDay` |
| Kecha eslatma olmagan (ketma-ket ikki kun yo'q) | `DafReminderLog` |
| Oxirgi 7 kunda 4 tadan kam eslatma yuborilgan (faqat `SENT`) | `DafReminderLog` |
| Bugun dushanba xulosasi olmagan | `DafReminderLog` |

ADR-0066 oddiy xabarlarni uzilgan chatga ham yuborishni talab qiladi
(chek, qarz). Bu qoida **muhim** xabarlar uchun; eslatma esa kerak emas,
shuning uchun uzilgan chat o'tkazib yuboriladi (ketma-ket 403 yo'q).

### 1.2 Matn

Ohang: salom → sabab → yumshoq taklif → minnatdorchilik (`feedback`:
o'quvchiga xabar ohangi), jazo va aybdorlik yo'q. Ism HTML-escape qilinadi.
Havola: `https://student.dafzentrum.uz/portal/lernen`.

Seriya hozir ≥ 2 bo'lsa (seriya — kechagi kungacha uzluksiz kunlar):

> Assalomu alaykum, {Ism}! Bugun hali mashq qilmadingiz — {N} kunlik
> seriyangiz davom etishi uchun bitta qisqa seans yetadi (taxminan 5
> daqiqa). Bugungi maqsad: {ball} ball. Davom etish: {havola} Rahmat!

Aks holda:

> Assalomu alaykum, {Ism}! Nemis so'zlaringiz xotirada qolishi uchun bugun
> bir qisqa seans yetadi. Bugungi maqsad: {ball} ball. Davom etish:
> {havola} Rahmat!

`{ball}` — o'quvchining kunlik maqsadi (`DafStudentSetting.dailyGoal`,
40/80/160; qator yo'q = 80). Bugun mashq qilmagani uchun «hozir» doim 0
bo'lgani sababli matnda faqat maqsad aytiladi. Tagida tugma
«Eslatmalarni to'xtatish».

---

## 2. Dushanba xulosasi

Dushanba 09:00 (Asia/Tashkent). O'tgan haftada kamida 1 ball topgan,
botga ulangan, chati uzilmagan, eslatmalari yoqilgan o'quvchiga bitta
xabar. Mashq qilmaganlarga yuborilmaydi. Umumiy bayram dushanbasida ham
yuboriladi (xulosa qo'ng'iroq emas).

> Assalomu alaykum, {Ism}! O'tgan hafta natijalaringiz:
> • Topilgan ball: {N}
> • Liga: {Daraja}, xonada {o'rin}-o'rin{ko'tarilgan bo'lsa: ". Tabriklaymiz, {Yangi} ligasiga ko'tarildingiz!"}
> • Guruhingiz: {o'rin}-o'rin, jami {M} guruhdan
> • Yangi nishonlar: {ro'yxat}
> Yangi haftada omad! Davom etish: {havola}

Qatorlar ma'lumot bo'lsa chiqadi: liga qatori — o'quvchining o'tgan hafta
xonasida `DafLeagueEntry` bo'lsa; guruh qatori — o'tgan hafta eng ko'p
ball topgan guruhi (`DafStudentDay.groupKey`) `DafGroupWeek` jadvalida
bo'lsa; nishon qatori — o'tgan hafta ichida olingan nishonlar bo'lsa.
Birinchi qator (ball) doim bor.

**Tayyorlik sharti.** Xulosa o'tgan hafta hisoblangandan keyin ketadi
(S3 `settleWeek`, dushanba 00:05): kompaniyada o'tgan hafta uchun
hisoblanmagan xona qolmagan bo'lishi kerak. Tayyor bo'lmasa cron soat
10:00, 11:00, … 18:00 da qayta urinadi; 18:00 gacha tayyor bo'lmasa shu
hafta xulosasi yuborilmaydi (jurnalga yozilmaydi, logda ogohlantirish).

---

## 3. O'chirish

- `DafStudentSetting.remindersEnabled Boolean @default(true)`. Bitta
  o'chirish ikkala turdagi xabarni to'xtatadi.
- **Ilovada:** «Darajam» tabida «Telegram eslatmalari» almashtirgichi;
  `PATCH /student-portal/lernen/eslatmalar` `{ yoqilgan: boolean }`;
  holat `GET fortschritt` javobida (`eslatmalar: boolean`; qo'shimcha
  so'rov yo'q — mavjud `sozlama` CTE ga ustun qo'shiladi).
- **Telegram'da:** xabar tagida «Eslatmalarni to'xtatish» tugmasi
  (`dr:off:<studentId>`). Bot handleri (`useBeforeScenes`, vazifalar
  handleri kabi) bosgan chat shu o'quvchining `telegramChatId` siga teng
  ekanini tekshiradi (ota-ona chati bir nechta bolani ulashi mumkin: faqat
  tugmadagi o'quvchi o'chadi), sozlamani yozadi, xabardan tugmani olib
  tashlaydi va «Eslatmalar to'xtatildi. Qayta yoqish: ilova → Darajam»
  deb javob beradi.
- Yozuvchi bitta: `eslatmalarniSaqla(prisma, studentId, companyId, yoqilgan)`
  (PATCH va bot handleri shu funksiyani chaqiradi; `upsert` — tanlov
  qatori yo'q bo'lsa yaratadi, mavjud `dailyGoal` ga tegmaydi).

---

## 4. Jurnal va idempotentlik

```
DafReminderLog
  id         Int @id @default(autoincrement())
  companyId  Int
  studentId  Int
  kind       DafReminderKind     enum EVENING | WEEKLY
  sentOn     DateTime @db.Date   Toshkent kuni
  status     DafReminderStatus   enum SENT | FAILED
  createdAt  DateTime @default(now())
  @@unique([studentId, kind, sentOn])
  @@index([companyId, sentOn])
```

- Yuborishdan **oldin** qator yoziladi (`INSERT … ON CONFLICT DO NOTHING
  RETURNING id`): qator yaratgan chaqiruv yuboradi, ikkinchi chaqiruv
  (ikki nusxa, qayta ishga tushirish) hech narsa qilmaydi. Natija
  `SENT`/`FAILED` ga yangilanadi (`FAILED` qayta urinilmaydi, kunlik/haftalik
  chegaraga sanalmaydi).
- Jurnalni faqat `daf/eslatma/eslatma-jurnali.ts` yozadi (qorovul spec,
  S2/S3 shaklida).
- Eski qatorlar 90 kundan keyin tozalanadi (kechki cron oxirida).

---

## 5. Yuborish va qorovullar

- Yuborish mavjud `SmsService.sendToStudent(…, 'AUTO', …)` orqali
  (audit `SmsMessage` va «SMS» tabi saqlanadi); yangi to'g'ridan-to'g'ri
  `.sendMessage(` chaqiruvchi yo'q (`direct-send.guard.spec.ts` o'zgarmaydi).
  `sendToStudent` ga ixtiyoriy `opts.replyMarkup` qo'shiladi (mavjud
  chaqiruvlar o'zgarmaydi).
- ADR-0025: bu xabarlar «darhol» ro'yxatiga qo'shiladi (yangi ADR-0117).
- Tezlik: ketma-ket, xabarlar orasida ≈ 60 ms (Telegram ≈ 30/s chegarasi
  ostida); 2 000 o'quvchi ≈ 2 daqiqa. Bitta o'quvchidagi xato logga yoziladi
  va qolganlarini to'xtatmaydi.
- **O'chirgich:** `DAF_ESLATMALAR` = `off` (standart) | `log` | `on`.
  `off` — cron hech narsa qilmaydi; `log` — auditoriyani hisoblaydi va
  sonlarni logga yozadi, yubormaydi; `on` — yuboradi. Prodda avval `log`,
  CEO matnni tasdiqlagach `on`.
- **Sinov nusxasi:** `scripts/daf-eslatma-sinov.ts --user=<CEO id>`
  (yoki `--chat=<chatId>`) uchala matnni (seriyali, seriyasiz, dushanba)
  namunaviy ma'lumot bilan CEO Telegram'iga yuboradi. Skript import
  qilinganda ishga tushmaydi, hech qanday o'quvchiga yubormaydi.

---

## 6. Server tuzilishi

`daf/eslatma/` ichida: `eslatma-qoidalari.ts` (sof: kimga, chegaralar,
sana arifmetikasi), `eslatma-matn.ts` (sof: ikki kechki matn va hafta
xulosasi, HTML-escape), `eslatma-auditoriya.ts` (bitta SQL: kechki va
haftalik auditoriya), `eslatma-jurnali.ts` (yagona yozuvchi),
`eslatma-yuborish.ts` (auditoriya → jurnal → `sendToStudent`),
`eslatma.cron.ts` (19:30 kechki, 09:00 va 10–18 soatlik haftalik),
`eslatma-telegram.handler.ts` (tugma), `eslatma-sozlama.ts`
(`eslatmalarniSaqla`). `fortschritt.service.ts` (704 qator) ga faqat ikki
qatorli ulanish kiradi.

Yangi marshrut: `PATCH /student-portal/lernen/eslatmalar` (sinfiy
`@StudentOnly` + `StudentCardGuard`, manifestda SELF, snapshot qatori,
DTO `@IsBoolean`). Boshqa o'zgarish: `GET fortschritt` javobiga ikki maydon
qo'shiladi — `eslatmalar` (sozlama qatori yo'q = yoqilgan) va
`telegramUlangan` (karta botga ulangan va uzilmagan; ekran shunga qarab
almashtirgichni faol yoki «Botga ulang» holatida ko'rsatadi).

---

## 7. Ekran

«Darajam» tabida «Nishonlarim» ostida kichik qator: «Telegram
eslatmalari» + almashtirgich + bir qatorli izoh («Kechki eslatma va
dushanba xulosasi»). Telegram'ga ulanmagan o'quvchida: «Botga ulang» izohi
bilan almashtirgich faol emas. Almashtirgich darrov saqlanadi (xato
bo'lsa xabar va qaytarish).

---

## 8. Sinash

- **Birlik:** `eslatma-qoidalari` (14 kun chegarasi, 4/7 kun, ketma-ket
  kun, yakshanba/bayram, dushanba xulosasidan keyingi kechki), matn
  (ikkala kechki variant, seriya 1 va 2, hafta xulosasi qatorlari bor/yo'q,
  HTML-escape, uzunlik < 4096), idempotentlik (jurnal ikkinchi chaqiruvda
  yubormaydi), `FAILED` hisoblanmaydi.
- **Server:** cron `off`/`log`/`on` rejimlari, xatoli o'quvchi qolganlarni
  to'xtatmaydi, bot tugmasi boshqa chatdan o'chira olmaydi, PATCH
  e2e (`studentId`siz token = 404), manifest, snapshot.
- **Haqiqiy baza:** auditoriya SQL'i brute-force bilan solishtiriladi
  (5 000 o'quvchi); xulosa SQL'i (liga, guruh, nishon qatorlari) brute-force.
- **Yuklama:** auditoriya so'rovi (5 000 o'quvchi) vaqti; cron to'liq
  yurishi soxta botda; p95 chegaralari boshqa so'rovlarda o'zgarmaydi
  (`fortschritt` ga ustun qo'shilgani sababli qayta o'lchanadi).
- **Brauzer:** almashtirgich (yoqilgan/o'chirilgan/ulanmagan), 390 px va
  desktop, yorug'/qorong'i. **Telegram:** CEO uchun sinov nusxasi.

## 9. Hujjat va deploy

ADR-0117 (raqam deploy oldidan tekshiriladi): eslatma «darhol» ro'yxatiga
qo'shilishi, uzilgan chatni o'tkazib yuborish sababi, jurnal va
o'chirgich. `server/CLAUDE.md` DaF bo'limiga 2–3 band. Xodimlar uchun bitta
yangilik yozuvi.

**Deploy tartibi:** migratsiya (`DafReminderLog`, ikki enum,
`remindersEnabled`) → kod (`DAF_ESLATMALAR=off`) → `log` rejimi bir kun
(auditoriya soni tekshiriladi) → CEO sinov nusxasini tasdiqlaydi →
`on`.

## 10. Bu bosqichda QILINMAYDI

O'quvchi vaqtni o'zi tanlashi · ota-onaga alohida xabar · ilova ichidagi
push · o'qituvchiga xabar (S5) · eslatma matnini sozlamalardan
o'zgartirish · A/B sinov · «seriya uzildi» xabari (jazo yo'q).

## 11. Xavflar

| Xavf | Qarshi chora |
| --- | --- |
| Xabar spamga aylanadi, o'quvchi botni bloklaydi | Kuniga ≤ 1, ketma-ket kun yo'q, haftada ≤ 4, ikki joydan o'chirish, uzilgan chat o'tkazib yuboriladi |
| Hammaga noto'g'ri matn ketadi | `DAF_ESLATMALAR=off` standart, avval `log`, CEO sinov nusxasini ko'radi, keyin `on` |
| Cron ikki nusxada ikki marta yuboradi | Jurnal `ON CONFLICT DO NOTHING RETURNING` bilan oldindan egallanadi |
| Dushanba xulosasi hisoblanmagan ma'lumot bilan ketadi | Tayyorlik sharti (hisoblanmagan xona yo'q), 10–18 qayta urinish, 18:00 dan keyin o'tkazib yuboriladi |
| Ota-ona chatida bir bola o'chirsa hammasi o'chadi | Tugma bitta o'quvchi uchun (`dr:off:<studentId>`), chat tengligi tekshiriladi |
| Telegram 429 / sekin yuborish | Ketma-ket ≈ 60 ms oraliq; xato faqat shu o'quvchiga tegishli |
| `fortschritt` sekinlashadi | Mavjud `sozlama` CTE ga bitta ustun va `Student` PK bo'yicha bitta qatorli `ulanish` CTE; yuklama qayta o'lchanadi (§12) |
| Auditoriya SQL'i sekin (5 000+) | Bitta o'tishli so'rov, brute-force va vaqt sinovda |

---

## 12. Yuklama natijalari

O'lchangan 19.10.2026, lokal sinov bazasi `daf_s1_yuklama` (12 000
o'quvchi, 1,46 mln urinish; S4 seed: 5 500 o'quvchida soxta chat, har
25-chisi uzilgan, har 20-chisida eslatmalar o'chirilgan, jurnal tarixi),
server kodi `8df789f7`, 10 yadroli mashina. Ikki o'lchov, bir xil kod va
ma'lumot: **yengil yuk** — load average 3,1 → 4,5; **og'ir yuk** — 5,8 → 9,9
(fonda ikkita CPU band qiluvchi jarayon bilan; S2 dagi «band mashina» 6,4 →
7,9 edi). Skript: `scripts/load/daf-yuklama-s4-olchov.ts` (S4) va
`daf-yuklama-olchov.ts` (S1–S3, o'zgarmagan). Hamma raqam p50 / p95, ms.

| Amal | Yengil yuk | Og'ir yuk | Chegara (p95) | Holat |
| --- | --- | --- | --- | --- |
| Kechki auditoriya (3 518 o'quvchi), 20 marta | 216 / 231 | 229 / 290 | 2 000 | o'tdi |
| — shu so'rovning jarayondagi birinchi chaqiruvi | 256 | 293 | 2 000 | o'tdi |
| Dushanba auditoriyasi (4 372 o'quvchi), 20 marta | 38 / 42 | 46 / 51 | 2 000 | o'tdi |
| — birinchi chaqiruv | 41 | 56 | 2 000 | o'tdi |
| `fortschritt`, 12 000 o'quvchidan tasodifiy aralash (sozlama qatori bor/yo'q × chat bor/uzilgan/yo'q), 50 × 10 | 58 / 83 | 74 / 101 | 200 | o'tdi |
| — chat + sozlama qatori | 57 / 83 | 74 / 100 | 200 | o'tdi |
| — chat, sozlama qatorisiz | 58 / 83 | 74 / 101 | 200 | o'tdi |
| — uzilgan chat | 58 / 84 | 75 / 102 | 200 | o'tdi |
| — chatsiz | 59 / 84 | 75 / 102 | 200 | o'tdi |
| `fortschritt`, S1–S3 aralashi (5 000 urinishli o'quvchi) | 59 / 107 | 75 / 120 | 200 | o'tdi |
| `fortschritt` · DUE / OCHIQ / TUGAGAN | 52 / 68 · 58 / 65 · 62 / 69 | 67 / 75 · 74 / 76 · 75 / 83 | 200 | o'tdi |
| `seansNatijasi`, tasodifiy aralash | 69 / 114 | 84 / 100 | 300 | o'tdi |
| `seansNatijasi` · nishon `INSERT` i, hamma qator yangi (YANGI) | 78 / 134 | 143 / 157 | 300 | o'tdi |
| `seansNatijasi` · ligaga birinchi qo'shilish | 115 / 129 | 132 / 154 | 300 | o'tdi |
| `guruhlar` (aralash · DUE) | 68 / 119 · 69 / 119 | 81 / 142 · 83 / 141 | 200 | o'tdi |
| `reyting zentrum` · `reyting gruppe` | 32 / 38 · 23 / 25 | 45 / 78 · 25 / 34 | 200 | o'tdi |
| `recordAttempt` · `nishonlar` · `liga` | 16 / 54 · 13 / 21 · 11 / 15 | 18 / 58 · 16 / 26 · 12 / 17 | 200 | o'tdi |

`fortschritt` S4 ustunlari (`sozlama` va `ulanish` CTE lari) qo'shilgandan
keyin ham S3 raqamlaridan (138 ms) past: qo'shilgan CTE lar bitta qatorni
o'qiydi, sozlama qatori borligi, chat borligi yoki uzilganligi vaqtni
o'zgartirmaydi (qatlamlar orasidagi farq p95 da 1–2 ms). Parallel yozuv
sinovlari (bir qator 50 yozuvchi, nishon 50 marta, ligaga 50 qo'shilish)
ikkala o'lchovda ham «OK».

**To'liq yurish** (haqiqiy `SmsService`: har xabarga `SmsMessage` va tarix
qatori; bot soxta, pauzasiz; `TELEGRAM_BOT_TOKEN` o'rnatilmagan, skript
soxta bot bo'lmasa to'xtaydi):

| Yurish | Auditoriya | Yengil yuk | Og'ir yuk | Prodda 60 ms pauza bilan |
| --- | --- | --- | --- | --- |
| Kechki | 3 518 | 13 636 ms (3,9 ms/xabar) | 10 775 ms (3,1) | ≈ 225 s (3,7 daq) |
| Dushanba | 4 372 | 16 883 ms (3,9 ms/xabar) | 12 090 ms (2,8) | ≈ 279 s (4,7 daq) |

Har yurishda: auditoriyadagi har o'quvchiga aynan bitta xabar (HTML, 4 096
dan qisqa, `dr:off:` tugmasi bilan), bitta `SENT` qator, bitta `SmsMessage`,
`FAILED` yo'q; ikkinchi yurish 0 xabar. Prod hisobi = o'lchangan vaqt +
auditoriya × 60 ms; haqiqiy Telegram javobi (har xabar ketma-ket kutiladi,
o'lchanmagan) shunga qo'shiladi. **Ikki cron nusxasi poygasi** (bir
auditoriyaga 50 parallel yurish): kechki 15 575 ms, 3 518 yuborildi,
172 382 o'tkazib yuborildi (= 49 × 3 518); dushanba 18 120 ms, 4 372
yuborildi, 214 228 o'tkazib yuborildi; xato 0, botga xabar = auditoriya,
`SENT` qator = `SmsMessage` = auditoriya, bir chatga bittadan ortiq xabar yo'q.
Poyga alohida bosqichda (`--faza=poyga`), qayta seed qilingan bazada, qo'shimcha
yuksiz o'tdi (load average 5,4 → 7,6). Og'ir yukdagi yurish yengilidan
tezroq chiqdi: sabab aniqlanmadi, ehtimol kesh isishi (yengil yuk
sessiyadagi birinchi to'liq yurish edi); 60 ms pauza bilan prod hisobi
farqni deyarli sezmaydi (222–225 s va 274–279 s).

**Moslik:** yuklamadan keyin `daf-yuklama-s4-paritet.ts` — kechki 3 518,
dushanba 4 372, farq 0.

**Eslatmalar.** (1) «Birinchi chaqiruv» jarayondagi birinchi chaqiruv;
Postgres keshi sovutilmadi, shuning uchun haqiqiy sovuq kesh yuqoridagidan
sekinroq bo'lishi mumkin. (2) Jadvalga kirmagan, ikkita band o'lchov
(hammasi o'sha S1–S3 skripti, bir xil kod). **8 ta CPU jarayoni** (load
12 → 14): hamma yo'l 2–4 marta sekinlashdi, S4 ga tegmaydiganlari ham
(`nishonlar` 21 → 92, `liga` 15 → 74 ms), chegaradan o'tmaganlar:
`fortschritt` p95 333 (S4 aralashi) va 389 (S1–S3 aralashi), `seansNatijasi`
363 (chegara 300), `guruhlar` 259 (chegara 200). **3 ta CPU jarayoni**
(load 8 → 10): `guruhlar` aralash p95 252 ms (chegara 200 dan yuqori),
qolganlari o'tdi. Shu yukda S4 ma'lumotisiz nazorat (S1–S3 skripti
yolg'iz, jurnal bo'sh, chat yo'q) ikki marta yurdi: `guruhlar` aralash /
`guruhlar (DUE)` p95 — 199 / 216 ms (birinchi), 176 / 164 ms (ikkinchi);
ya'ni nazoratning o'zi ham 200 ms dan o'tdi (216). `guruhlar` SQL'ining
yakka o'zi `EXPLAIN (ANALYZE, BUFFERS)` da 26 ms (hammasi keshda). Xulosa:
S4 emas, protsessor yetishmasligi. Jadvaldagi og'ir yuk (2 jarayon, load
5,8 → 9,9; S4 skripti 5,8 → 7,3, S1–S3 skripti 7,3 → 9,9) hammasi
chegara ichida. (3) Kechki auditoriya vaqtining ≈ 80% i seriya kichik
so'rovida — bu Task 4 dagi bitta `EXPLAIN ANALYZE` (4 marta takror) dan
olingan raqam, qayta o'lchanmagan. 60 kunlik oyna + 60 kunga yetgan seriya
uchun to'liq hisob («zaxira») natijani o'zgartirmaydi (3 518 qatorda
farq 0), lekin bu ma'lumotda sekinroq (211 → 243 ms: ko'p o'quvchida 105
kunlik seriya, hammasi zaxiraga tushadi); 2 yillik tarixli vaqtinchalik
nusxada (o'quvchiga 593 qator) tezroq: 800 → 408 ms. Bu to'rt raqam
`psql` da qo'lda, har biri 5 marta takrorlab (`\timing`, `EXPLAIN`siz)
olingan bitta o'lchov; Node skriptining p50/p95 lari bilan bir-biriga
to'g'ridan-to'g'ri taqqoslanmaydi (SQL'lar `task-12-report.md` da).
Chegaradan (2 000 ms) ancha past, shuning uchun **hozir qo'llanmaydi**;
auditoriya p95 si prodda 1 000 ms dan oshsa yoki tarix 2 yildan oshsa
qo'llanadi.

**Ma'lum cheklov / keyingi qadam.** S3 ning `guruhlar` so'rovi (S4 jadvalini
o'qimaydi) load average ≥ 8 (10 yadroda) bo'lganda 200 ms chegarasi
oldidagi zaxirasini yo'qotadi: nazoratda ham 164–216 ms. Bu S4 regressiyasi
emas va S4 da kod o'zgarmaydi. Keyingi qadam: ishga tushgandan keyin prodda
`GET guruhlar` p95 sini kuzatish; kerak bo'lsa arzon variantlar — kunlik
kesh yoki qamrab oluvchi indeks.
