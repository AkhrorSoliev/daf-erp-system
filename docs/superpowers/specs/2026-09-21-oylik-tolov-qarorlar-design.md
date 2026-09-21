# Oylik to'lov tizimi — CEO qarorlari va dizayn o'zgarishlari

**Sana:** 2026-09-21
**Holat:** qarorlar olingan, reja yozilmagan
**Asos:** [2026-09-02-oylik-tolov-tizimi-design.md](2026-09-02-oylik-tolov-tizimi-design.md)
**Javoblar:** [docs/tolov-savollari/javoblar.md](../../tolov-savollari/javoblar.md)

---

## 1. Bu hujjat nima uchun

02.09 dagi dizayn tasdiqlangan, 1-bosqich kodi yozilgan (73 commit), lekin
prodga chiqmagan. Chiqmaganining sababi kod emas edi: 26 ta qaror savoli
ma'muriyatdan javob kutardi.

**21.09.2026 da CEO hammasiga javob berdi.** Javoblarning bir qismi asl
dizaynni tasdiqladi, bir qismi esa **o'zgartirdi**. Asl hujjat o'sha
kundagi qarorlarning yozuvi sifatida tahrirlanmaydi; bu hujjat farqni
qayd etadi va yangi ish hajmini ta'riflaydi.

---

## 2. ASOSIY QOIDA — hammasi sozlamaga, filial boshiga

> CEO: «Savollarning javoblari va ularga berilgan variantlarning hammasi
> sozlamaga chiqariladi. Kerakli boshqa variantlar ham qo'shiladi. Har bir
> markaz va **har bir filial** uchun alohida qiymat qo'yila oladi.»

Bu butun ishning shaklini o'zgartiradi. Asl dizayn (§8) To'lov bo'limi
uchun **6 ta sozlama** sanagan; endi **~25 ta** bo'ladi, va ularning
deyarli hammasi filial darajasida boshqariladi.

`Setting` modeli buni allaqachon ko'taradi — `branchId` nullable, filial
qatori uchun qisman unique indeks bor. Poydevor tayyor; yetishmayotgani
ustki qism.

**Sozlamalar sahifasi hozir faqat kompaniya darajasini o'qiydi/yozadi.**
Filial boshqacha qiymatga ega bo'lsa CEO ga sariq eslatma chiqadi, lekin
o'sha yerdan tahrirlab bo'lmaydi. Filial darajasida tahrirlash
qo'shilishi kerak.

---

## 3. O'zgargan qarorlar

| Asl dizayn | CEO qarori (21.09) | Ta'siri |
|---|---|---|
| §3 Q3/Q4: uzrli dars → **kredit** (keyingi oy to'lovi kamayadi) | **Asosiysi — dars qayta o'tiladi.** Kredit — ikkinchi yo'l, imkoni bo'lmaganda | §5.2 dagi `excusedLessons` mexanizmi **ixtiyoriy** bo'ladi; qayta dars mexanizmi **yangi** |
| §5.4: o'rtada ketganda pul **avtomatik** balansga qaytadi | **Administrator tanlaydi:** pul o'quvchigami yoki markazga | Yangi dialog + tanlov oqibatini ko'rsatish |
| §5.5: 14-dars o'tilsa **o'qituvchiga haq yoziladi** (markaz ko'taradi) | **Ustoz oyligi dars soniga bog'liq emas** — 13 ham, 14 ham bir xil | `PERCENTAGE` allaqachon shunday; `FIXED_PER_STUDENT` bo'luvchisi va ko'chirilgan dars qoidasi — 4-bo'lim |
| §8: 6 ta sozlama, kompaniya darajasida | **~25 ta sozlama, filial darajasida** | Sozlamalar sahifasi qayta quriladi |
| §12: «guruh/o'quvchi darajasida to'lov turini ustidan yozish» keyingi bosqichga | Eski **12 talik usul saqlanadi** (`LESSON_PACK`) | Qo'shimcha ish emas — mavjud `Course.paymentModel` yetarli, faqat o'chirmaslik kerak |

### Tasdiqlangan qarorlar (o'zgarmadi)

- §3 Q1: oy boshida bitta yechim
- §3 Q2: o'rtada qo'shilganga proratsiya
- §3 Q6: qarz 1-sanadan (10-kungacha ogohlantirilmaydi — bu yangi tafsilot)
- §5.5: oylik narx dars soniga bog'liq emas (o'quvchi tomoni)

---

## 4. Ustoz oyligi — kod tekshirildi, ta'siri kutilgandan kichik

CEO: «Oyda dars soni o'zgarsa, ustoz oyligi o'zgarmasin.»

Dastlab bu «eng katta kod ta'siri» deb baholangan edi. Kod tekshirilgach
(`salary/shared/deserved-math.ts`, `monthly-charge.service.ts`) rasm
boshqacha:

**`PERCENTAGE` — allaqachon to'g'ri.** Oylik yo'lda ustoz haqi
`perLessonCost` dan hisoblanadi, u esa hisob yaratilganda
`oylik narx / o'sha oydagi dars soni` sifatida **muzlatiladi**. 13 darslik
oyda har dars qimmatroq, 14 darslikda arzonroq — jami bir xil. Bu aynan
o'quvchi tomonidagi qoida, va u allaqachon ishlaydi.

**`FIXED_PER_STUDENT` — bitta bo'luvchi noto'g'ri.** Hozir
`value / lessonPaymentCount` (kursdagi 12). 14 darslik oyda
14 × value/12 chiqadi — oydan oshadi. Oylik kursda bo'luvchi
`plannedLessons` bo'lishi kerak. Bir qatorlik o'zgarish + test.

**Ko'chirilgan dars — bayram rejadan CHIQMAYDI.** `resolveExcludedDates`
bayram kunlarini `plannedLessons` dan chiqarib tashlardi: 13 darslik oy 12
deb muzlatilar, keyin bayram darsi boshqa kunga ko'chirilib o'tilganda
(10-javob) o'sha davomat 13- dars sifatida §5.5 bo'yicha ustozga qo'shimcha
haq yozardi → 1-javobga zid. Yechim: bayram rejada qoladi, faqat bekor
qilingan (ko'chirilmagan) dars chiqadi. Ko'chirilgan dars asl kunning
o'rnini egallaydi — asl kunga davomat yozilmaydi, yangi kunga yoziladi,
sanoq 13 da qoladi. (Avval rejalashtirilgan `includedDates` yechimi bekor:
u faqat hisob yaratilishidan OLDIN ma'lum ko'chirishlarni ko'rardi, o'rta
oyda qilinganlarni emas.)

`FIXED_MONTHLY` xodimlarga tegmaydi.

---

## 5. Yangi sozlamalar ro'yxati

Har biri kompaniya **va** filial darajasida. `payment.` prefiksi bilan.

### Narx va hisob-kitob

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `defaultModel` | yangi kurs uchun standart model | `MONTHLY` |
| `chargeDayOfMonth` | hisob yaratiladigan kun | `1` |
| `debtVisibleFromDay` | qarz qaysi kundan **ko'rinadi** | `1` |
| `debtWarnFromDay` | qaysi kundan **ogohlantiriladi** | `10` |

### Uzrli dars

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `excusedMode` | `RETEACH` / `CREDIT` / `BOTH` | `BOTH` |
| `excusedNoticeHours` | necha soat oldin xabar berish shart | `24` |
| `excusedRequiresCertificate` | ma'lumotnoma talab qilinsinmi | `true` |

### Muzlatish va ketish

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `frozenMoneyHoldDays` | muzlatilgan pul necha kun kutadi | `14` |
| `lostStudentHoldDays` | yo'qolgan o'quvchi puli necha kun kutadi | `14` |
| `dropWithholdPercent` | kursni tashlaganda ushlanadigan foiz | `50` |

### Davomat

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `attendanceGraceHours` | dars tugagach necha soat ichida olinishi mumkin | aniqlanmagan |
| `attendanceLateNeedsApproval` | muhlatdan keyin direktor ruxsati kerakmi | `true` |

### Chegirma

| Kalit | Ma'nosi | Boshlang'ich |
|---|---|---|
| `teacherPayBasis` | ustoz haqi `FULL_PRICE` / `DISCOUNTED` / `SPLIT` | `FULL_PRICE` |
| `minStudentPaymentPercent` | eng kam to'lov foizining **yuqori chegarasi** | aniqlanmagan |

> **Diqqat:** CEO eng kam foizni global sozlama emas, **o'quvchi
> profilida** kiritiladigan qildi. Bu yerdagi sozlama faqat «100% chegirma
> taqiqlanadi» qoidasini majburlaydi.

### Bekor qilingan sozlamalar

- `excusedCreditMonthlyCap` — CEO raqamli chegara o'rniga ma'lumotnoma
  talabini tanladi. Sozlama **kerak emas**.
- `prorationMethod`, `debtGraceDays` — asl dizaynda sanalgan, hech qachon
  yozilmagan; `debtGraceDays` o'rnini `debtWarnFromDay` egalladi.

---

## 6. Yangi ish elementlari

1. **Filial darajasida sozlama tahrirlash** — sahifa hozir faqat
   kompaniya darajasini yozadi.
2. **Muzlatilgan pul dialogi** — administrator *sababli/sababsiz* deb
   belgilaydi. **Tanlashdan oldin oqibati ekranda ko'rinib turishi
   shart:** «sababli → 277 000 o'quvchiga qaytadi / sababsiz →
   277 000 markazga o'tadi».
3. **O'rtada ketish dialogi** — xuddi shu naqsh: pul o'quvchigami yoki
   markazgami, oqibati ko'rinib turadi.
4. **Imtiyozli o'quvchilar ro'yxati** — hozir yo'q. `Student.discountPercent`
   va auditli `Discount` modeli bor, lekin ularni bir joyda ko'rsatadigan
   ekran yo'q.
5. **100% chegirma taqiqi** — validatsiya.
6. **Kurs narxiga amal qilish sanasi** — hozir narx darhol kuchga kiradi.
   `CoursePriceSnapshot` bor, lekin u **o'tmishni** yozadi, kelajakka
   qo'yilgan narxni emas. Naqsh tayyor: `EmployeeSalaryConfigVersion`
   `effectiveFrom` bilan aynan shuni qiladi.
7. **Uzrli darsni qayta o'tish mexanizmi** — hozir yo'q. Mavjud
   `LessonReschedule` butun guruhni ko'chiradi; bu esa bitta o'quvchiga
   qarzdor bo'lingan darsni kuzatishi kerak.
8. **`FIXED_PER_STUDENT` bo'luvchisi + bayram rejadan chiqmaydi** — 4-bo'limga qara. Kichik.

---

## 7. ⚠️ Mavjud tizim bilan ziddiyatlar

### 7.1 Qarz kechirish — CEO taqiqladi, tizimda esa ochiq amal sifatida bor

CEO: «Qarz kechirilishi bo'lmaydi. Ketgan o'quvchi 1 yildan keyin qaytsa
ham uni qayta aniqlay olishimiz kerak. Qancha vaqt o'tsa ham qachon
qancha qarz qolganini bilishimiz kerak.»

Tizimda kechirish **avtomatik emas** — bu ataylab qilinadigan amal:

- `POST /students/:id/enrollments/:enrollmentId/write-off-cycle-debt` —
  faqat DROPPED/FROZEN yozuv uchun, `reason` + `confirmAmount` majburiy,
  `@Roles('CEO', 'Branch Director', 'Administrator')`
- `removeFromGroup` da `writeOffCycleDebt=true` bayrog'i — chiqarish
  vaqtida ixtiyoriy
- `/payments/debt` → «Kechirilganlar» tabi va CEO uchun qaytarish yo'li

Hech kim hech narsani bexosdan o'chirmaydi. Lekin 9-javobga ko'ra bu
amal umuman bo'lmasligi kerak — va hozir uni Administrator ham qila
oladi.

**Qaror:** amal `payment.debtWriteOffEnabled` sozlamasi bilan yopiladi
(boshlang'ich `false`), tugma va bayroq yashiriladi, server rad etadi.
O'chirib tashlash o'rniga sozlama — chunki prodda allaqachon kechirilgan
qarzlar bor va ularning tarixi «Kechirilganlar» tabida ko'rinib turishi
kerak (9-javobning «qachon qancha qarz qolgan» talabi).

«Qachon qancha qarz qolgan» — `ReportsDebtHistoryService` qarzni paydo
bo'lgan oyi bo'yicha allaqachon ajratadi. Yangi mantiq shart emas.

### 7.2 `chargeDayOfMonth` kompaniya darajasiga qulflangan

Kod ataylab shunday: oy boshi croni va qorovul `branchId` bilan hech
qachon o'qimaydi, shuning uchun filial qiymati saqlansa ham hech qachon
ishlatilmasdi — `companyLevelOnly` bayrog'i shu sababdan qo'yilgan.

CEO «har filial alohida» deganidan keyin cron ham filial bo'yicha
yurishi kerak. Bu kichik o'zgarish emas: cron bir kunda bir necha marta
yurishi yoki har filialning o'z kunini tekshirishi kerak bo'ladi.

### 7.3 Davomat oynasi kodga qotirilgan

Hozir ustoz darsdan 10 daqiqa oldin — dars tugagunicha davomat ola
oladi (`validateLessonDate`). CEO buni sozlamaga chiqarishni so'radi.
Direktorlar va administratorlar uchun cheklov yo'qligi saqlanadi.

---

## 8. Ochiq savollar

1. **Muzlatishda:** administrator «sababli» desa-yu, o'quvchi baribir
   qaytmasa — `frozenMoneyHoldDays` muhlati baribir ishlaydimi va pul
   markazga o'tadimi?
2. **Qarz kechirish:** 7.1 dagi yechim (sozlama bilan yopish) CEO tasdig'ini kutadi.
3. **`attendanceGraceHours`** boshlang'ich qiymati belgilanmagan.
4. **`minStudentPaymentPercent`** yuqori chegarasi belgilanmagan.

---

## 9. Mavjud rejaning ko'rigi (21.09)

`2026-09-02-oylik-tolov-yadro.md` — 10 vazifa, hammasi commit qilingan.
Har biri 26 javob bilan solishtirildi.

| Vazifa | Holati | Izoh |
|---|---|---|
| 1 Sxema | ✅ turadi | `PaymentModel` ikkala usulni saqlaydi (23-javob). Qo'shimcha: muzlatish muddati muhri, kurs narxi amal sanasi |
| 2 Oylik arifmetika | ✅ turadi | Kredit qo'llash (`applyLessonCredit`) `excusedMode` ga bog'lanadi |
| 3 Oydagi dars kunlari | ✅ turadi | Sof funksiya o'zgarmaydi; `resolveExcludedDates` bayramni chiqarmaydi (4-bo'lim) |
| 4 Ledger yozuvi | ✅ turadi | — |
| 5 `MonthlyChargeService` | ⚠️ | Kredit ixtiyoriy bo'ladi; muzlatish oqimi qayta ishlanadi (19-javob) |
| 6 Davomat `MONTHLY` shoxi | ⚠️ kichik | `FIXED_PER_STUDENT` bo'luvchisi; `EXCUSED` → kredit faqat sozlama ruxsat bersa |
| 7 Oy boshi croni | ⚠️ | Filial bo'yicha yurishi kerak (7.2) — 3-bosqichga |
| 8 O'rtada qo'shilgan/ketgan | ⚠️ | Kurs almashish **allaqachon har guruh o'z dars soni bilan** (13-javob) ✅ — test qo'shiladi. Ketish: pul manzili parametr bo'ladi (6-javob); `dropWithholdPercent` (20-javob) |
| 9 Migratsiya hisoboti | ⚠️ | Bugungi bazada qayta yurgiziladi; sana 01.09 → yangi sana |
| 10 Migratsiya qo'llash | ✅ turadi | Sana o'zgaradi |

**Xulosa:** 10 vazifadan hech biri bekor bo'lmadi. Ikkitasi bir qatorlik
tuzatish, uchtasi yangi parametr, bittasi (cron) keyingi bosqichga.

### Chiqishdan OLDIN shart bo'lganlar

Bularsiz tizim CEO qoidasiga zid pul hisoblaydi:

1. `FIXED_PER_STUDENT` bo'luvchisi → `plannedLessons` (1-javob)
2. Bayram rejadan chiqmaydi — ko'chirilgan dars ustozga qo'shimcha haq yozmasin (1, 10)
3. `payment.debtWriteOffEnabled=false` — kechirish yopiladi (9)
4. ~~`payment.excusedMode`~~ — **kiritilmaydi.** 18-javob «ikkalasi ham»
   dedi, lekin `RETEACH` mexanizmi yo'q; faqat `CREDIT` bor bo'lgan enum
   dekorativ variant bo'lardi (reyestr qoidasi: sozlama faqat iste'molchisi
   bilan). Mavjud `payment.excusedCreditEnabled` kredit yo'lining o'zi;
   `excusedMode` 4-bosqichda `RETEACH` bilan birga keladi
5. Migratsiya hisobotini bugungi bazada qayta yurgizish — **sxema chiqqandan
   KEYIN** (pastga qarang)

### Chiqishdan KEYIN — bosqichlar

**2-bosqich — pul qarorlari dialoglari.** Muzlatilgan pul: ushlab
turish + administrator sababli/sababsiz tanlovi + muddat muhri (19).
Ketish: pul o'quvchigami/markazgami (6). `dropWithholdPercent` (20).
Ikkala dialog uchun **bitta umumiy «oqibat ko'rsatuvchi»** komponent —
CEO talabi: tanlashdan oldin summa ko'rinib turadi.

**3-bosqich — sozlamalar kengayishi.** Filial darajasida tahrirlash.
`chargeDayOfMonth` filialga + cron filial bo'yicha (7.2). Davomat
muhlati (2). Uzrli dars: soat + ma'lumotnoma bayrog'i (8, 24). Qarz
ko'rinish/ogohlantirish kunlari (21).

**4-bosqich — yangi ekranlar.** Qayta dars mexanizmi (18). Imtiyozlilar
ro'yxati + 100% taqiqi (17). Kurs narxiga amal sanasi (26). Asl
dizaynning 3-bosqichi: profil nishoni, balans kartasi, qarzdorlar
ro'yxati, Telegram matnlari.

**Nega shu tartib:** 1-bosqich o'quvchidan noto'g'ri pul olmaydi va
ustozga noto'g'ri haq yozmaydi. 2–4 bosqichlar qulaylik va nazorat
qo'shadi, lekin ularsiz ham hisob to'g'ri — yo'q dialog o'rnida
administrator hozirgi «avtomatik balansga qaytadi» yo'lini oladi, bu
19-javobdagi «sababli» natijaning o'zi.

---

## 10. Keyingi qadamlar

1. ✅ Amalga oshirish rejasi: [2026-09-21-oylik-tolov-chiqishdan-oldin.md](../plans/2026-09-21-oylik-tolov-chiqishdan-oldin.md)
2. Reja bo'yicha 5 ish shoxda bajariladi
3. Shox bugungi `main` ustiga ko'chiriladi (508 commit orqada)
4. **Sxema + kod prodga chiqariladi** — xatti-harakat o'zgarmaydi:
   `Course.paymentModel` DEFAULT `LESSON_PACK`, `payment.defaultModel`
   boshlang'ichi `LESSON_PACK`, cron oylik kurs topmaydi
5. Migratsiyaning **sinov hisoboti** prodda yurgiziladi — u
   `EnrollmentMonthlyCharge` jadvaliga murojaat qiladi (`scopeWhere`),
   shuning uchun sxemadan OLDIN yurolmaydi. Avvalgi «hisobot → chiqarish»
   tartibi shu sababdan teskarisiga o'zgardi
6. CEO hisobotni o'qib tasdiqlaydi
7. `--apply --limit=5` → `verify` → limitsiz `--apply` → `verify`
8. CEO Sozlamalar → To'lov da standart modelni **Oylik** qiladi

**Dasturdan tashqari:** shartnoma yurist bilan tuzatilishi kerak —
narxlar yangilanadi, «oyiga 12 dars» olib tashlanadi, markaz aybi bilan
o'tilmagan dars bandi qo'shiladi, narx oshishi 15 kun oldin xabar
qilinishi tizimga bog'lanadi. Bu chiqishdan oldin tayyor bo'lishi kerak.
