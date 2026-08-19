# Namangan filialini bo'shatish (branch #2 reset)

**Sana:** 2026-08-19
**Holat:** BAJARILDI — 2026-08-19, prod (`caring-courage`)
**Filial:** Namangan = `Branch.id = 2`, `companyId = 1001`

---

## 1. Muammo

Namangan filiali go-live'ga tayyorgarlik uchun test ma'lumoti bilan to'ldirilgan.
Endi u to'liq tozalanishi va noldan qayta ochilishi kerak: o'quvchilar, o'qituvchilar
va adminlar — barchasi.

## 2. Prod holati (2026-08-19 da o'lchangan)

Namangan'dagi **hamma narsa `2026-08-05` da bir kunda yaratilgan** — bu seed
yuklamasi, real ish emas. Buni quyidagi nollar tasdiqlaydi:

| Nol bo'lgan | Qiymat |
|---|---|
| Payment, Transaction, Attendance, SalaryAccrual | 0 |
| Contract, Refund, Expense, CashMovement | 0 |
| Lead, MockExam, GroupTeacher | 0 |
| PlannedAbsence, LessonCancellation, LessonReschedule | 0 |
| 84 o'quvchining balansi | hammasi 0 |

### Mavjud yozuvlar

| Ob'ekt | Soni | FK qoidasi |
|---|---|---|
| Student | 84 | ko'p RESTRICT |
| User (Student roli, `Student.userId`) | 84 | UserRole CASCADE |
| StudentBranch | 84 | CASCADE |
| Enrollment | 87 | RESTRICT |
| EnrollmentStateLog | 90 | CASCADE |
| SmsMessage (hammasi `FAILED`) | 87 | **RESTRICT** |
| Group | 12 | RESTRICT |
| GroupScheduleSnapshot | 17 | CASCADE |
| GroupHolidayExtension | 8 | CASCADE |
| Room | 3 | RESTRICT |
| RoomCapacitySnapshot | 3 | CASCADE |
| Course | 4 | Branch'ga SET NULL |
| CoursePriceSnapshot | 5 | CASCADE |
| Xodim User | 7 | — |
| Notification (xodimlarniki) | 93 | **RESTRICT** |
| UserRole (xodimlarniki) | 9 | CASCADE |
| UserBranch | 8 (7 xodim + CEO) | CASCADE |
| CashAccount (balans 0) | 2 | — |
| LeadColumn + LeadSection | 1 + 1 | LeadSection RESTRICT |
| DailyFinancialSnapshot | 14 (05.08–18.08) | — |
| EntityHistory (Student 258 + Group 125 + b.) | ~780 | `entityId` — oddiy matn, FK emas |
| StatusHistory (Group 12) | 12 | shu kabi |

### O'chiriladigan 7 xodim

`UserBranch.branchId = 2` bo'lgan foydalanuvchilar, **CEO'dan tashqari**:

- #10768 Sardorbek Maqsudaliyev — Branch Director, Administrator
- #10772 Namangan Test — Teacher
- #10774 Komila Jalolxonova — Teacher
- #10775 Gulyoraoy Hamroxo'jayeva — Teacher
- #10776 Madina Meliboyeva — Teacher
- #10777 Nozima Mamadjanova — Teacher
- #10904 Marxaboxon Jamoliddinova — Administrator, Cashier

## 3. Izolyatsiya isboti

Namangan'da Farg'ona bilan ulashilgan **hech narsa yo'q**:

- Ikkala filialda turgan o'quvchi: **0**
- Namangan o'quvchisi boshqa filial guruhida: **0**
- Namangan guruhini olib boruvchi o'qituvchi: **0** (umuman biriktirilmagan)
- Namangan kursidan foydalanuvchi boshqa filial guruhi: **0**
- Namangan kursiga bog'langan shartnoma: **0**
- Namangan xonasiga bog'langan `LessonReschedule`: **0**

Yagona kesishuv nuqtasi — **CEO Sherali Yodgorov #10562**, yagona ikkala filialda
turgan foydalanuvchi (roli: CEO, Branch Director, Administrator; `mainBranch = 1`).
U o'chmaydi va uning `UserBranch(2)` qatoriga tegilmaydi.

Kodda `branchId = 2` hech qayerda qattiq yozilmagan — faqat test fayllarida
(`client/src/lib/branch-header.test.ts`, `branch-cache.test.ts`).

## 4. Qaror: filial qoladi, ichi tozalanadi

`Branch` qatorining o'zi **saqlanadi**. Sabablari:

1. `Branch` o'chsa CEO'ning `UserBranch(2)` qatori CASCADE bilan yo'qoladi va
   qo'lda qaytarish kerak bo'ladi.
2. Brauzerda saqlangan filial tanlovi (`resolveStoredBranch`) buziladi.
3. `entityId` ni matn sifatida saqlaydigan audit jadvallarida eski `2` ga ishora
   qiluvchi orphan qatorlar qoladi va yangi filial ID lari bilan aralashadi.

### Bootstrap infratuzilmasi ham saqlanadi

[`branches.service.ts:139-198`](../../../server/src/branches/branches.service.ts)
da filial yaratilganda **faqat o'sha bir marta** quriladigan va UI'dan qayta
yaratib bo'lmaydigan ikki narsa bor:

- **2 ta `CashAccount` (CASH + BANK).** `CashAccount.branchId` NOT NULL va
  kompaniya darajasida zaxira hisob yo'q (D4 qarori). Kassasiz filial umuman pul
  qabul qila olmaydi — `resolveAccountId` xato tashlaydi.
- **`systemKey = 'NEW'` `LeadColumn`.** Ustunsiz filialda bo'lim ham, lid ham
  bo'la olmaydi; /leads sahifasi UI'dan chiqish yo'li yo'q boshi berk ko'chaga
  aylanadi.

Ikkalasi ham hozir butunlay bo'sh (0 pul harakati, 0 lid), shuning uchun ularni
saqlash tozalikni buzmaydi. Mavjud `LeadSection` ham shu bilan qoladi.

## 5. Nima o'chadi — 5 qadam, bitta tranzaksiya

Tartib child → parent, RESTRICT bog'liqliklar birinchi.

**1-qadam — o'quvchi tomoni**
`SmsMessage` (87) → `EnrollmentStateLog` (90) → `Enrollment` (87) →
`StudentBranch` (84) → `Student` (84) → `Notification` + `UserRole` + `User`
(84 ta o'quvchi akkaunti). `Notification.userId` RESTRICT — o'quvchi
akkauntlariniki ham, xodimlarniki (3-qadam) kabi, `User`dan oldin ketishi
SHART; bu qator avval yo'q edi va kod bilan mos kelmasdi.

**2-qadam — guruh / xona / kurs**
`GroupScheduleSnapshot` (17), `GroupHolidayExtension` (8) → `Group` (12) →
`RoomCapacitySnapshot` (3) → `Room` (3) → `CoursePriceSnapshot` (5) → `Course` (4)

**3-qadam — xodimlar**
`Notification` (93) → `UserRole` (9), `UserBranch` (7) → `User` (7)

**4-qadam — audit izlari**
`EntityHistory`: o'chirilgan Student / Group / Room / Course / User yozuvlariga
ishora qiluvchi qatorlar.
`StatusHistory`: shu kabi (Group 12 + User).

**5-qadam — suratlar**
`DailyFinancialSnapshot` `branchId = 2` (14 qator).

## 6. Skript

`server/scripts/reset-branch.ts` — idempotent, `railway run` orqali ishlatiladi.

| Bayroq | Xatti-harakat |
|---|---|
| (bayroqsiz, standart) | Faqat sanaydi va ro'yxat chiqaradi. Hech nima o'chmaydi (`--confirm` yo'q). |
| `--dry-run` | ANIQ dry-run: `--confirm` berilgan bo'lsa ham hech nima o'chirilmaydi, bu holat stdout'ga yoziladi. |
| `--backup` | O'chishdan oldin barcha qatorlarni `scripts/backups/` ichiga JSON qilib yozadi |
| `--confirm="<filial nomi>"` | Haqiqiy o'chirish. `--dry-run` bilan birga berilsa — e'tiborga olinmaydi. |

Skript filial ID sini argument sifatida oladi (`--branch=2`), va `--confirm`
qiymati DB dagi filial nomiga **aynan** mos kelishi tekshiriladi — noto'g'ri
filialni tasodifan tozalashning oldi olinadi. Namangan uchun bu qiymat
`Namangan filali` (prod'da nom shu tarzda, bitta `i` tushib qolgan holda saqlangan).

Yuqoridagi to'rttadan boshqa bayroq (masalan `--dryrun`, `--dry_run`, biror
matn xatosi) xato bilan rad etiladi — noma'lum bayroq "ishladi" degan
noto'g'ri taassurot qoldirmasligi kerak, jimgina e'tiborsiz qoldirilmaydi.

### Xavfsizlik kafolatlari

1. **Ochiq `WHERE "branchId" = 2` ishlatilmaydi.** Har bir `DELETE` tranzaksiya
   boshida bir marta yig'ilgan aniq ID ro'yxatiga tayanadi (`WHERE id = ANY($ids)`).
2. **Assert:** yig'ilgan har bir ID to'plami filial #2 ga tegishli ekani qayta
   tekshiriladi (o'quvchilar `StudentBranch`, o'quvchi akkauntlari `UserBranch`,
   guruhlar/xonalar/kurslar `branchId`, xodimlar `UserBranch` bo'yicha). Bironta
   begona ID topilsa — `throw`, tranzaksiya bekor.
3. **CEO qorovuli:** o'chiriladigan foydalanuvchilar ro'yxatidan `UserBranch`
   qatorlari soni 1 dan ko'p bo'lgan har qanday foydalanuvchi chiqarib tashlanadi.
   Hozir bu faqat #10562, lekin qoida umumiy.
4. **Bitta `$transaction`** — yarim o'chgan holat bo'lishi mumkin emas.
5. **Oldin/keyin sanoq — YUQORI CHEGARA, TENGLIK EMAS.** Skript boshqa
   filiallarga tegishli (branch-scoped) hamda kompaniya bo'ylab olingan
   (`users`, `payments`, `transactions`, `attendances`, `salaryAccruals`,
   `cashAccounts`, `leadColumns`, `entityHistory`) bir nechta jadval sanog'ini
   o'chirishdan oldin va keyin oladi. Har bir sanoqning tushishi reset
   o'chirgan qatorlar soniga **TENGDAN OSHMASLIGI** kerak (`≤`), aks holda
   natija xato deb hisoblanadi. Nega tenglik emas: `$transaction` 120
   soniyagacha davom etishi mumkin, va shu oyna ichida boshqa admin amaliyoti
   (yangi o'quvchi, yangi audit yozuvi) parallel yozadi — bu tushishni
   kutilganidan hatto kamroq (yoki manfiy) ko'rsatishi mumkin, va bu signal
   EMAS. Signal faqat tushish kutilganidan **ko'p** bo'lganda.
   Bu tekshiruv nimani ANIQLAYDI: gross ortiqcha o'chirishni — masalan boshqa
   filialning guruhi xato ravishda reja ID ro'yxatiga kirib qolishi. Nimani
   ANIQLAMAYDI: 6-banddagi SET NULL/CASCADE mutatsiyalarini — ular boshqa
   filialning qatorini SONI o'zgarmasdan turib jimgina o'zgartiradi (masalan
   `Contract.groupId` NULL bo'lib qoladi), shuning uchun bu sanoqda umuman
   ko'rinmaydi.
6. **Tashqaridan ishora tekshiruvi (`assertNoInboundReferences`):** reja
   TASHQARISIDAGI qatorlar reja ICHIDAGI biror ID ga ishora qilayotganini
   tekshiradi — `GroupTeacher.teacherId` (CASCADE), `Group.roomId` (SET NULL),
   `Contract.groupId` (SET NULL), `EmployeeSalaryConfig.groupId` (SET NULL),
   `MockExamParticipant.studentId` (SET NULL), `AiConversation.studentId`
   (SET NULL). Bittasi topilsa ham — rad javobi; tranzaksiya boshlanishidan
   OLDIN ham, ICHIDA ham tekshiriladi. Ishlab chiqarishda o'lchangan
   (2026-08-19): oltitasi ham Namangan uchun hozir nol.
7. **Saqlanishi SHART bo'lgan qatorlar tekshiruvi:** `Branch` qatorining o'zi,
   ikkala `CashAccount` va `systemKey='NEW'` `LeadColumn` + uning
   `LeadSection`i o'chirishdan oldin va keyin **ANIQ TENG** sanaladi (na ko'p,
   na kam). 5-banddagi sanoq bu filialni ATAYLAB chetlab o'tadi (u "boshqa
   filial buzilmadimi" deb so'raydi) — shuning uchun eng muhim kafolat
   ("filial hali ham pul qabul qila oladimi") mustaqil, alohida o'lchanadi.

## 7. Bajarish tartibi

1. Lokal seed DB da `--dry-run`, keyin to'liq ishga tushirish; Farg'ona (#1)
   sanoqlari o'zgarmaganini tasdiqlash.
2. Prod'da `railway run ... --branch=2 --dry-run` — chiqqan sonlar ushbu hujjatdagi jadvalga
   mos kelishini tekshirish.
3. Prod'da `railway run ... --branch=2 --backup --confirm="Namangan filali"`.
4. Keyingi tekshiruv: Namangan'da 0 o'quvchi, 0 guruh, 0 xona, 0 kurs, 0 xodim;
   2 kassa hisobi va 1 lid ustuni joyida; filial #1 sanoqlari o'zgarmagan.

## 8. Qayta ochish

Kod o'zgarishi shart emas. /branches da Namangan hali ham turadi (nomi, telefoni,
ish vaqti 08:00–22:00, ish kunlari dushanba–shanba saqlanadi). Tartib:
xodim qo'shish → xona → kurs → guruh → o'quvchi.

O'chirilgan xodimlarning telefon raqamlari bo'shaydi (`User.phone` unique emas,
lekin telefon bo'yicha login qidiruvi bir xil raqamli ikki akkauntda chalkashadi),
shuningdek guruh nomlari `#001`–`#012` ham bo'shaydi (`@@unique([name, branchId])`).

## 9. Doirasidan tashqarida

- Mavjud arxiv «butunlay o'chirish» oqimini tuzatish. U bu ishni bajara olmaydi
  ([`archive-delete.service.ts:87`](../../../server/src/archive/archive-delete.service.ts)
  faqat 8 jadvalni biladi va `SmsMessage`/`Notification` RESTRICT'iga urilib
  yiqiladi), lekin uni tuzatish alohida ish.
- Filialni UI'dan bo'shatish tugmasi. Bu bir martalik operatsiya; skript yetarli.
- Farg'ona filialiga har qanday o'zgartirish.


---

## 10. Bajarilgan ish (2026-08-19)

Prod'da `railway run npx ts-node scripts/reset-branch.ts --branch=2 --backup
--confirm="Namangan filali"` bilan bajarildi. Dry-run sonlari ushbu hujjatning
2-bo'limidagi o'lchovga aynan mos keldi, ya'ni 05.08 dan beri filialda ish
boshlanmagan edi. Uchala qorovul ham (moliyaviy tarix, RESTRICT to'siqlar,
ichkariga qaragan bog'lanishlar) jimgina o'tdi.

### O'chirilgan qatorlar

| Jadval | Soni | | Jadval | Soni |
|---|---|---|---|---|
| `smsMessage` | 87 | | `group` | 12 |
| `enrollmentStateLog` | 90 | | `roomCapacitySnapshot` | 3 |
| `enrollment` | 87 | | `room` | 3 |
| `studentBranch` | 84 | | `coursePriceSnapshot` | 5 |
| `student` | 84 | | `course` | 4 |
| `notification` | 97 | | `userBranch` | 7 |
| `userRole` | 93 | | `user` | 91 |
| `groupScheduleSnapshot` | 17 | | `entityHistory` | 483 |
| `groupHolidayExtension` | 8 | | `statusHistory` | 12 |
| `groupTeacher(History)` | 0 | | `dailyFinancialSnapshot` | 14 |

Jami 1281 qator. `user` 91 = 84 o'quvchi akkaunti + 7 xodim. Guruh 12 = 11
tirik + 1 arxivdagi (`#010`, 05.08 da Sardorbek Maqsudaliyev tomonidan yumshoq
o'chirilgan) — hard reset arxivni ham tozalaydi, aks holda qayta ochilgan
filial arxivida hech qachon yo'qolmaydigan guruh qolib ketardi.

### Tekshiruv

Saqlanishi shart bo'lgan qatorlar — oldin/keyin qat'iy tenglik:
`branch` 1→1, `cashAccount` 2→2, `leadColumn` 1→1, `leadSection` 1→1.
Filial `Namangan filali`, ACTIVE, 08:00–22:00, telefon 883885550 saqlandi;
kassa hisoblari (CASH + BANK, balans 0), `Yangi Lidlar [NEW]` ustuni va uning
bo'limi joyida; CEO Sherali Yodgorov (#10562) va uning filial bog'lanishi
tegilmadi.

Farg'ona (#1) mustaqil ravishda qayta o'lchandi va bironta qatori
o'zgarmagani tasdiqlandi: 788 o'quvchi, 60 guruh, 27 xodim, 6 xona, 4 kurs,
1705 to'lov, 45 119 tranzaksiya, 19 190 davomat, 12 118 oylik hisoblanmasi.

### Zaxira

`server/scripts/backups/branch-2-reset-2026-08-19T11-30-26-727Z.json`, 597 KB,
22 bo'lim, 1282 qator — o'chirilgan har bir qatorning aynan nusxasi (bir qator
ortiq: `branch` qatorining o'zi, u o'chirilmagan). Katalog gitignore
qilingan va fayl faqat operatorning mashinasida turadi: BU YAGONA NUSXA.

Tiklash skripti YOZILMAGAN. Qaytarish kerak bo'lsa qo'lda ish talab qilinadi:
`Student.id` va `User.id` avtoinkrement, shuning uchun aniq ID bilan qo'yish va
keyin ketma-ketliklarni `setval` bilan tiklash, o'chirish tartibiga TESKARI
yo'nalishda.

### Qayta ochish

Kod o'zgarishi shart emas. /branches da Namangan turibdi. Tartib: xodim qo'shish
→ xona → kurs → guruh → o'quvchi.
