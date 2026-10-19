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
DTO `@IsBoolean`). Boshqa o'zgarish: `GET fortschritt` javobiga
`eslatmalar`.

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
| `fortschritt` sekinlashadi | Faqat mavjud `sozlama` CTE ga bitta ustun; yuklama qayta o'lchanadi |
| Auditoriya SQL'i sekin (5 000+) | Bitta o'tishli so'rov, brute-force va vaqt sinovda |
