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
| §5.5: 14-dars o'tilsa **o'qituvchiga haq yoziladi** (markaz ko'taradi) | **Ustoz oyligi dars soniga bog'liq emas** — 13 ham, 14 ham bir xil | ⚠️ Eng katta kod ta'siri — 4-bo'limga qara |
| §8: 6 ta sozlama, kompaniya darajasida | **~25 ta sozlama, filial darajasida** | Sozlamalar sahifasi qayta quriladi |
| §12: «guruh/o'quvchi darajasida to'lov turini ustidan yozish» keyingi bosqichga | Eski **12 talik usul saqlanadi** (`LESSON_PACK`) | Qo'shimcha ish emas — mavjud `Course.paymentModel` yetarli, faqat o'chirmaslik kerak |

### Tasdiqlangan qarorlar (o'zgarmadi)

- §3 Q1: oy boshida bitta yechim
- §3 Q2: o'rtada qo'shilganga proratsiya
- §3 Q6: qarz 1-sanadan (10-kungacha ogohlantirilmaydi — bu yangi tafsilot)
- §5.5: oylik narx dars soniga bog'liq emas (o'quvchi tomoni)

---

## 4. ⚠️ Ustoz oyligi — eng katta kod ta'siri

CEO: «Oyda dars soni o'zgarsa, ustoz oyligi o'zgarmasin.»

Hozirgi tizimda ustoz **dars boshiga** haq oladi (`PERCENTAGE` yoki
`FIXED_PER_STUDENT`), ya'ni 14 darslik oyda 13 darslik oydan ko'proq
oladi. Asl dizayn (§5.5) buni ataylab saqlagan edi.

**Yangi qoidada bu ishlamaydi.** Ikki yo'l bor:

**A) Ustozni `FIXED_MONTHLY` ga o'tkazish** — rad etiladi. O'rtada
qo'shilgan/ketgan o'quvchi uchun proratsiya buziladi, `SalaryAccrual`
o'quvchi boshiga yozilishi yo'qoladi, va «markaz qo'shimchasi»
mexanizmi ishlamay qoladi.

**B) Dars narxini OYDAN kelib chiqib hisoblash** — tanlanadi:

```
perLessonAccrual = oylik haq / o'sha oydagi dars soni
```

13 darslik oy: har dars qimmatroq. 14 darslik oy: har dars arzonroq.
**Oylik jami — bir xil.** Bu o'quvchi tomonidagi mantiqning aynan
ko'zgusi (`oylik narx / o'sha oydagi dars soni`), shuning uchun ikkala
tomon ham bitta qoida bilan yuradi.

Ta'sir qiladigan joylar: `salary/shared/deserved-math.ts`
(`perLessonAccrual`), `salary-accrual.service.ts`, va gap-sweep
(`computeGapAccruals`). `FIXED_MONTHLY` xodimlarga tegmaydi.

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
8. **Ustoz oyligini oydan normallashtirish** — 4-bo'limga qara.

---

## 7. ⚠️ Mavjud tizim bilan ziddiyatlar

### 7.1 Qarz kechirish — CEO taqiqladi, tizimda esa bor

CEO: «Qarz kechirilishi bo'lmaydi. Ketgan o'quvchi 1 yildan keyin qaytsa
ham uni qayta aniqlay olishimiz kerak. Qancha vaqt o'tsa ham qachon
qancha qarz qolganini bilishimiz kerak.»

Tizimda esa:

- `student-enrollment.service.ts` guruhdan chiqarishda `DEBT_WRITE_OFF`
  qatori yozadi — ya'ni **qarzni o'chiradi**
- `/payments/debt` sahifasida «Kechirilganlar» tabi bor
- `POST /billing/debt-write-offs/:id/reverse` (CEO) qaytarish yo'li bor

**Qaror kerak:** chiqarishdagi avtomatik kechirish olib tashlanadimi,
yoki sozlama bilan o'chiriladimi? Va prodda allaqachon yozilgan
kechirilgan qarzlar bilan nima qilinadi?

«Qachon qancha qarz qolgan» talabi allaqachon bajarilgan:
`ReportsDebtHistoryService` qarzni paydo bo'lgan oyi bo'yicha ajratadi.

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
2. **Qarz kechirish:** 7.1 dagi qaror.
3. **`attendanceGraceHours`** boshlang'ich qiymati belgilanmagan.
4. **`minStudentPaymentPercent`** yuqori chegarasi belgilanmagan.

---

## 9. Keyingi qadamlar

1. Bu hujjat asosida **amalga oshirish rejasi** yoziladi
2. Shox bugungi `main` ustiga ko'chiriladi (508 commit orqada)
3. Migratsiyaning **sinov hisoboti** bugungi bazada yurgiziladi
4. CEO hisobotni o'qib tasdiqlaydi
5. Prodga chiqariladi

**Dasturdan tashqari:** shartnoma yurist bilan tuzatilishi kerak —
narxlar yangilanadi, «oyiga 12 dars» olib tashlanadi, markaz aybi bilan
o'tilmagan dars bandi qo'shiladi, narx oshishi 15 kun oldin xabar
qilinishi tizimga bog'lanadi. Bu chiqishdan oldin tayyor bo'lishi kerak.
