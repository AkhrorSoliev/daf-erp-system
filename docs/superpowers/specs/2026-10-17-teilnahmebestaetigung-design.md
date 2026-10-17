# Teilnahmebestätigung — darajani tugatgan o'quvchiga qatnashganlik hujjati

**Sana:** 2026-10-17
**Holati:** Loyiha — CEO ko'rigi kutilmoqda
**Bog'liq:** ADR-0044 (darajani tugatgan o'quvchi), ADR-0054 («Dars bo'ldimi?», davomat), ADR-0028 (huquq bazadan o'qiladi), ADR-0096 (muhrlangan natija namunasi). Bu dizayn bilan birga yangi ADR yoziladi (ma'lumot modeli va qoida o'zgaradi) — raqami PR vaqtida `docs/adr/README.md` dan olinadi.

## 1. Maqsad

O'quvchi darajani (A1, A2, B1…) tugatgach, markaz unga **Teilnahmebestätigung** — shu darajada qatnashgani haqidagi hujjat — beradi. Hozir tizimda bunday hujjat ham, uni berish qoidasi ham yo'q (ADR-0044 faqat «Darajani tugatdi» deb pul qoidasini aytadi).

Hujjat **qatnashganlikni** tasdiqlaydi, baho emas. Imtihon va mock natijasi shart emas, hujjatda ma'lumot sifatida chiqadi.

## 2. CEO qarorlari (17.10.2026)

| #   | Savol                       | Qaror                                                                                                                                      |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Hujjat nimani tasdiqlaydi   | Faqat qatnashganlik. Imtihon, mock, kech qolish — ma'lumot, shart emas                                                                     |
| Q2  | Davomatda sababli kelmagan  | Maxrajdan chiqariladi. Oldindan aytilgan «sababsiz» kelmaslik kelmagan hisoblanadi                                                         |
| Q3  | Davomat chegarasi           | 80%                                                                                                                                        |
| Q4  | Ilova (Student App)         | Ikkinchi shart: hujjat berilgan kunda ochiq bo'lgan darslarning belgilangan foizi tugatilgan; foiz daraja bo'yicha sozlanadi, boshida 100%. Kontenti yo'q darajada shart o'chiq |
| Q5  | Kim va qachon yaratadi      | Administrator tugmasi. Daraja tugaganini tizim o'zi bilmaydi (ADR-0044), uni administrator tasdiqlaydi                                      |
| Q6  | QR va ko'rinish             | Hujjatda QR bo'ladi, u ochiq tekshirish sahifasiga olib boradi. Dizayn original va yoqimli bo'lishi kerak (namuna tasdiqlanadi)             |

Men qo'ygan boshlang'ich qarorlar (CEO ko'rib o'zgartirishi mumkin): bir daraja bir necha guruhda o'tilsa davomat yig'iladi; shart bajarilmasa faqat CEO sababini yozib istisno beradi; o'quvchining holati (faol, muzlatilgan, bitirgan) o'zi to'siq emas.

## 3. Qoida

Hisob **bir o'quvchi + bir daraja** uchun. Daraja — `Group.level` (A1, A2…). O'quvchi shu darajadagi hamma guruhlarda ishtirok etgan davomat qatorlari yig'iladi.

### 3.1 Davomat

Manba — o'quvchining o'z `Attendance` qatorlari. Qator yo'q kun (bayram, bekor qilingan va davomat olinmagan dars) o'z-o'zidan hisobga kirmaydi, taqvim qayta qurilmaydi.

| Qator                                                              | Hisobda                      |
| ------------------------------------------------------------------ | ---------------------------- |
| `PRESENT`                                                          | keldi (surat va maxrajda)    |
| `LATE`                                                             | keldi (surat va maxrajda), kech qolish soniga +1 |
| `ABSENT`                                                           | kelmadi (faqat maxrajda)     |
| `EXCUSED`, `cancellationId` bor (dars bekor qilingan)              | chiqariladi                  |
| `EXCUSED`, `cancellationId` yo'q (sababli kelmagan)                | chiqariladi                  |
| `EXCUSED`, shu kun uchun `PlannedAbsence` `SABABSIZ` bor           | kelmadi (maxrajda)           |

**Foiz = (PRESENT + LATE) ÷ (PRESENT + LATE + ABSENT + oldindan aytilgan sababsiz).** Maxraj 0 bo'lsa foiz yo'q va shart bajarilmagan. Oldindan aytilgan sababsizni `AbsenceStreakService` ham xuddi shunday kelmagan o'qiydi (ADR-0023), bir qoida ikki joyda ikki xil bo'lmaydi.

Davr: shu darajadagi birinchi qator sanasidan oxirgi qator sanasigacha. Sanalar Toshkent kuni (`common/date/tashkent`).

### 3.2 Ilova

Manba — `DafLessonProgress.completedAt`. Faqat `DafLevel` bor daraja (A1, A2, B1) uchun.

- **Ochiq dars:** `retiredAt` bo'lmagan unitdagi dars, mashqi bor (`exercises` > 0). Yakuniy sinov (`UNIT_TEST`) o'z mashqiga ega emas, uning ochiqligi unitning boshqa darslari ochiqligiga bog'liq. Ta'rif yagona funksiyada turadi; aniq shart reja bosqichida kodga qarab tasdiqlanadi.
- **Foiz = o'quvchi tugatgan ochiq darslar ÷ ochiq darslar.**
- Ochiq dars 0 (kontent yo'q: A2, B1 hozir; B2 va yuqori daraja umuman yo'q) bo'lsa ilova sharti **qo'llanmaydi**, faqat davomat hal qiladi. Hujjatda ilova satri chiqmaydi.
- Ochiq darslar vaqt o'tib ko'payadi. Foiz hujjat berilgan kunda hisoblanadi va hujjatga muhrlanadi.

### 3.3 Shart

`berilishi mumkin = davomat foizi ≥ davomat chegarasi VA (ilova qo'llanmasa YOKI ilova foizi ≥ ilova chegarasi)`.

Chegaralar daraja bo'yicha: `davomat` boshida 80, `ilova` boshida 100. Qator yo'q daraja uchun shu boshlang'ich qiymatlar.

### 3.4 Hujjatda ma'lumot sifatida (shart emas)

- Kech qolishlar soni (`LATE` qatorlari).
- Mock imtihon: o'quvchiga bog'langan (`MockExamParticipant.studentId`) va `level` shu darajaga teng, baholangan eng oxirgi natija (ball, maksimal ball, sana). Bog'lanmagan qatnashchi qidirilmaydi.
- Yakuniy sinovdan o'tgan unitlar soni (`DafSession.passed`).

Ilovadagi **faol vaqt** kiritilmaydi: `StudentAppSession` vaqtni darajaga bog'lamaydi, daraja bo'yicha son chiqarib bo'lmaydi.

## 4. Ma'lumot modeli

**`ParticipationCertificate`** — berilgan har hujjat bitta qator. Hisob natijasi **muhrlanadi**: keyin davomat tuzatilsa yoki chegara o'zgarsa ham berilgan hujjatning raqamlari qimirlamaydi (ADR-0096 dagi naqsh).

- `id`, `companyId`, `branchId` (o'quvchi branchi, yozish paytida), `studentId`, `level`
- `number` — `TB-2026-0001`, kompaniya + yil bo'yicha ketma-ket; Serializable tranzaksiyada `max + 1`, `@@unique([companyId, year, seq])`
- `issuedAt`, `issuedById`
- `snapshot Json` — davr (dan, gacha), davomat (keldi, kech, kelmadi, hisobdagi, foiz), ilova (tugatgan, ochiq, foiz yoki `null`), mock satri, unit sinovlari soni, guruh nomlari, ishlatilgan chegaralar, o'quvchi ismi, tug'ilgan sana
- `exemptReason String?`, `exemptById Int?` — faqat CEO istisnosi
- `deletedAt`, `deletedById`, `deletionBatchId` — arxivlash (o'chirib bo'lmaydi), partial unique

**`ParticipationRule`** — daraja bo'yicha chegara: `companyId`, `level`, `minAttendancePercent`, `minAppPercent`, `@@unique([companyId, level])`. Qator yo'q bo'lsa 80 / 100.

PDF saqlanmaydi: `snapshot` dan har safar qayta chiziladi. Fayl xotirasi (R2) kerak emas.

## 5. Server

Modul: `server/src/participation-certificates/`.

- `participation-rules.ts` — **sof funksiyalar** (bazaga tegmaydi): davomat qatorlarini sanash (3.1), ilova foizi (3.2), shart (3.3). Yagona hisob joyi, ekran ham, hujjat ham shundan o'qiydi.
- `participation-certificates.service.ts` — bitta o'quvchi uchun ma'lumot yig'ish, `preview`, `issue`.
- Endpointlar (hammasi `@BranchScope()`, filial yo'l manifestida yozilgan):
  - `GET /students/:id/participation-certificates/preview` — o'quvchi qatnashgan har daraja uchun foizlar, shart natijasi, avval berilgan hujjatlar. Rollar: CEO, Branch Director, Administrator.
  - `POST /students/:id/participation-certificates` — `{ level, exemptReason? }`. Shart bajarilgan bo'lsa hujjat yaratadi. Bajarilmagan bo'lsa 400, faqat CEO `exemptReason` bilan o'tadi (CEO roli **bazadan** o'qiladi, ADR-0028; boshqaga 403). Qaytishda to'liq yozuv.
  - `GET /participation-certificates/:id/pdf` — PDF. Rollar yuqoridagidek, o'quvchi filiali tekshiriladi.
  - `GET/PUT /settings/participation-rules` — chegaralar. Faqat CEO.
- Bir o'quvchiga bir darajaga qayta berish mumkin (yangi raqam); eskisi arxivga ketmaydi, ro'yxatda ko'rinadi.
- Tarix: `EntityHistory` — o'quvchida `QATNASHISH_HUJJATI_BERILDI` (raqam, daraja, istisno bo'lsa sabab). Chegara o'zgarishi kompaniya sozlamasi tarixida.
- `Group.level` bo'sh guruh qatnashgan darajaga kirmaydi; preview'da «Guruh darajasi ko'rsatilmagan» deyiladi.
- **Haqiqiylikni tekshirish (QR).** Hujjatdagi QR ochiq sahifaga olib boradi: `GET /participation-certificates/:id/verify` (`@Public()`, `IpThrottlerGuard`, route manifestida PUBLIC) va mijozda `/t/[id]` sahifasi, `/r/[id]` (kvitansiya) bilan bir xil naqsh. `id` — taxmin qilib bo'lmaydigan UUID (ketma-ket `TB-…` raqami emas, aks holda raqamlarni terib o'quvchilar ismini ko'rib chiqish mumkin bo'lardi). Sahifa faqat shuni ko'rsatadi: «haqiqiy» yoki «bekor qilingan», raqam, ism, daraja, davr, berilgan sana, markaz va filial nomi. Tug'ilgan sana, foizlar, mock va ilova natijasi ochiq sahifaga chiqmaydi. QR manzili kvitansiyalardagi `publicBaseUrl()` dan olinadi, nusxa ko'chirilmaydi.
- Telegramga yuborish **birinchi versiyada yo'q**.

## 6. Hujjat (PDF)

PDF `pdfmake` bilan (`receipts/pdf/render.ts` dagi mavjud yo'l), nemischa matn, bitta A4 sahifa. Namuna (17.10.2026) CEO ko'rigiga yuborildi; QR shu namunaga kiritilgan.

**Mazmun:** markaz va filial nomi, «Teilnahmebestätigung», o'quvchi ismi va tug'ilgan sanasi, daraja, davr, «Anwesenheit X % (a von b Unterrichtseinheiten)», ilova qo'llansa «Lernplattform Y %», bo'lsa kech qolish soni, yakuniy sinovlar va mock satri, «kurs qatnashganligini tasdiqlaydi, Sprachzertifikat o'rnini bosmaydi» izohi, QR («Echtheit prüfen»), hujjat raqami va sana, imzo va muhr joyi. Ixtiyoriy satr ma'lumot bo'lmasa chiqmaydi.

**Ko'rinish (original dizayn):** iliq oq fon (`#FFFDF8`); yuqori o'ng burchakda to'q ko'k (`#17375E`) chorak doira ichida katta oq «A1» va «NIVEAU», uning atrofida ikkita ingichka oltin (`#B8924A`) halqa; pastki chap burchakda kichik aks sado; sarlavha to'q ko'k, ism katta, ostida qisqa oltin chiziq; davomat va ilova foizi halqa ko'rsatkich (SVG) bilan, qolgan raqamlar chap chetida oltin chizig'i bor kichik bloklarda. Shrift — markazning `Inter`i, yangi shrift qo'shilmaydi.

**`pdfmake` tuzoqlari (namunada topildi, amalga oshirishda hisobga olinadi):**
- Fon qatlami uchun `pageMargins: [0,0,0,0]`, asosiy tarkib esa o'z `margin`i bilan stack ichida. Sahifa chekkasi bor bo'lsa, butun sahifalik fon bloki sig'masdan **jimgina tashlab yuboriladi**.
- Fon ichidagi hamma tugun (to'liq sahifa tuvali ham) `absolutePosition` bilan beriladi, aks holda ular oqim balandligiga qo'shilib, blok yana sig'maydi.
- SVG ichidagi matn `Inter` bilan chiziladi (sinab ko'rildi). «100 %» ga kichikroq o'lcham kerak, aks holda yozuv halqa chizig'iga tegadi.
- Ixtiyoriy satrlar o'zgaruvchan, shuning uchun halqa va QR bloklari oqimda turadi, fon faqat bezak.

Jins ma'lum bo'lsa ismdan oldin «Herr/Frau» CEO javobini kutadi; hozircha faqat ism.

## 7. Administrator ekrani

O'quvchi kartasida yangi tab «Hujjatlar» (tab ma'lumoti faqat ochilganda yuklanadi). Har daraja uchun qator: davomat foizi, ilova foizi, ikkala chegara, yashil/qizil belgi, kech qolish soni. Shart bajarilgan bo'lsa «Hujjat berish» tugmasi; bajarilmagan bo'lsa tugma yopiq va sababi yoziladi («Davomat 74%, kerak 80%»). CEO uchun «Istisno bilan berish» (sabab majburiy). Berilgan hujjatlar ro'yxati: raqam, sana, PDF yuklash.

Sozlamalar sahifasida (faqat CEO) «Teilnahmebestätigung» bo'limi: har daraja uchun ikki chegara.

Ekrandagi matnlarda inglizcha so'z yo'q. Dizayn namunasi chizilib CEO ko'radi, keyin quriladi.

## 8. Testlar

- `participation-rules.spec.ts`: jadvalning har qatori (3.1), oldindan aytilgan sababsiz, maxraj 0, chegara aniq 80 va 79,9, ilova qo'llanmaydigan daraja, ilova 100 va 99.
- Servis: bir necha guruhli daraja yig'iladi; boshqa filial o'quvchisi 403; mock bog'lanmagan bo'lsa satr chiqmaydi.
- Kontroller: `@Roles` metadata va `RolesGuard` ruxsat/rad; faqat CEO istisnosi; manifest spec.
- Muhrlash: hujjat berilgach davomat o'zgarsa PDF raqamlari o'zgarmaydi.
- PDF: shablon xatosiz chiziladi, raqam va foiz matnda bor.

## 9. Ma'lum chegaralar (ochiq masalalar)

1. **Darajani ikki marta o'tgan o'quvchi** (masalan A1 ni takrorlagan): hisob hamma guruhlarni yig'adi. Preview'da guruhlar bo'yicha taqsimot ko'rinadi, administrator ko'zi bilan baholaydi. Davrni qo'lda tanlash keyingi versiyada.
2. **Ilovadan foydalanuvchi kam** (25.09 holatiga 2 o'quvchi). Ilova sharti A1 da amalda ko'pchilikni to'xtatishi mumkin; shuning uchun CEO foizni sozlay oladi va istisno bor.
3. **Daraja imtihoni balli** saqlanmaydi (tizimda joyi yo'q). Kerak bo'lsa alohida kichik maydon qo'shiladi va hujjatda satr bo'ladi.
4. **Mock bog'lash:** qatnashchi o'quvchi kartasiga bog'lanmagan bo'lsa hujjatda chiqmaydi.
5. **Ochiq dars ta'rifi** (3.2) reja bosqichida kodga qarab aniqlashtiriladi.

## 10. Qamrovdan tashqari

Telegram orqali yuborish, o'quvchining o'zi ilovadan so'rashi, daraja imtihoni balli, hujjat shabloni tillari (faqat nemischa), ommaviy yaratish.
