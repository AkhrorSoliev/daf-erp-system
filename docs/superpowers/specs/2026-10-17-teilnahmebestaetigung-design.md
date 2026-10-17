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
| Q6  | QR va ko'rinish             | Hujjatda QR bo'ladi, u ochiq tekshirish sahifasiga olib boradi. Dizayn jimjimador emas, lekin yoqimli; tuzilishi Goethe-Zertifikat'ga o'xshash (logotip, nom va rang bizniki) |
| Q7  | Shrift                      | IBM Plex Serif (sarlavha va qiymatlar) + IBM Plex Sans (qolgan matn), saytdagi Plex oilasi                                                 |
| Q8  | Kim nomidan                 | Hujjat DaF Sprachzentrum nomidan beriladi. Filial hujjatda ham, tekshirish sahifasida ham yozilmaydi. Imzo qatori, kurs rahbari, markaz rahbari va muhr yo'q: hujjatning haqiqiyligini QR tasdiqlaydi |

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

Chegaralar: davomat uchun bitta umumiy son (boshida 80), ilova uchun daraja bo'yicha (A1, A2, B1; boshida 100). Ular `Setting` jadvalida turadi (4-bo'lim), alohida jadval yo'q.

### 3.4 Hujjatda ma'lumot sifatida (shart emas)

- Kech qolishlar soni (`LATE` qatorlari).
- Mock imtihon: o'quvchiga bog'langan (`MockExamParticipant.studentId`) va `level` shu darajaga teng, baholangan eng oxirgi natija (ball, maksimal ball, sana). Bog'lanmagan qatnashchi qidirilmaydi.
- Yakuniy sinovdan o'tgan unitlar soni (`DafSession.passed`).

Ilovadagi **faol vaqt** kiritilmaydi: `StudentAppSession` vaqtni darajaga bog'lamaydi, daraja bo'yicha son chiqarib bo'lmaydi.

## 4. Ma'lumot modeli

**`ParticipationCertificate`** — berilgan har hujjat bitta qator. Hisob natijasi **muhrlanadi**: keyin davomat tuzatilsa yoki chegara o'zgarsa ham berilgan hujjatning raqamlari qimirlamaydi (ADR-0096 dagi naqsh).

- `id`, `companyId`, `branchId` (o'quvchi filiali, yozish paytida), `studentId`, `level`. `branchId` faqat kirish huquqi va hisobot uchun; hujjatga ham, ochiq sahifaga ham chiqmaydi
- `number` — `TB-2026-0001`, kompaniya + yil bo'yicha ketma-ket; Serializable tranzaksiyada `max + 1`, `@@unique([companyId, year, seq])`
- `issuedAt`, `issuedById`
- `snapshot Json` — davr (dan, gacha), davomat (keldi, kech, kelmadi, hisobdagi, foiz), ilova (tugatgan, ochiq, foiz yoki `null`), mock satri, unit sinovlari soni, guruh nomlari, ishlatilgan chegaralar, o'quvchi ismi, tug'ilgan sana
- `exemptReason String?`, `exemptById Int?` — faqat CEO istisnosi
- `revokedAt DateTime?`, `revokedReason String?` — hujjatni bekor qilish ustuni. Birinchi versiyada yozadigan yo'l yo'q (YAGNI); ochiq tekshirish sahifasi uni o'qiydi, shuning uchun yo'l keyin faqat bitta route bo'lib qo'shiladi. Hujjat hech qachon o'chirilmaydi

**Chegaralar yangi jadval emas, mavjud sozlamalar tizimida** (`SettingsService`, kompaniya darajasi, faqat CEO yozadi): `participation.minAttendancePercent` (0–100, boshida 80) va `participation.minAppPercent.A1` / `.A2` / `.B1` (0–100, boshida 100). Qiymat yo'q bo'lsa boshlang'ich son o'qiladi.

PDF saqlanmaydi: `snapshot` dan har safar qayta chiziladi. Fayl xotirasi (R2) kerak emas.

## 5. Server

Modul: `server/src/participation-certificates/`.

- `participation-rules.ts` — **sof funksiyalar** (bazaga tegmaydi): davomat qatorlarini sanash (3.1), ilova foizi (3.2), shart (3.3). Yagona hisob joyi, ekran ham, hujjat ham shundan o'qiydi.
- `participation-certificates.service.ts` — bitta o'quvchi uchun ma'lumot yig'ish, `preview`, `issue`.
- Endpointlar. Yangi imkoniyat kaliti qo'shilmaydi: mavjud `students.details` va `students.manage` ishlatiladi (ikkalasi: CEO, Branch Director, Administrator). O'quvchi id'si bilan kelganlar o'quvchi filialini `assertCallerMayTouchStudent` bilan tekshiradi (`BRANCH_SCOPED_BY_ENTITY`):
  - `GET /students/:id/participation-certificates/preview` (`students.details`) — o'quvchi qatnashgan har daraja uchun foizlar, shart natijasi, chegaralar, avval berilgan hujjatlar.
  - `POST /students/:id/participation-certificates` (`students.manage`) — `{ level, exemptReason? }`. Shart bajarilgan bo'lsa hujjat yaratadi. Bajarilmagan bo'lsa 400, faqat CEO `exemptReason` bilan o'tadi (CEO roli **bazadan** o'qiladi, ADR-0028; boshqaga 403). Qaytishda to'liq yozuv.
  - `GET /participation-certificates/:id/pdf` (`students.details`) — PDF; hujjat o'quvchisining filiali tekshiriladi.
  - `GET /participation-certificates/settings`, `PATCH /participation-certificates/settings` (`@CeoOnly()`, `COMPANY_WIDE`) — chegaralar.
- Bir o'quvchiga bir darajaga qayta berish mumkin (yangi raqam); eskisi arxivga ketmaydi, ro'yxatda ko'rinadi.
- Tarix: `EntityHistory` — o'quvchida `QATNASHISH_HUJJATI_BERILDI` (raqam, daraja, istisno bo'lsa sabab). Chegara o'zgarishi kompaniya sozlamasi tarixida.
- `Group.level` bo'sh guruh qatnashgan darajaga kirmaydi; preview'da «Guruh darajasi ko'rsatilmagan» deyiladi.
- **Haqiqiylikni tekshirish (QR).** Hujjatdagi QR ochiq sahifaga olib boradi: `GET /participation-certificates/:id/verify` (`@Public()`, `IpThrottlerGuard`, route manifestida PUBLIC) va mijozda `/t/[id]` sahifasi, `/r/[id]` (kvitansiya) bilan bir xil naqsh. `id` — taxmin qilib bo'lmaydigan UUID (ketma-ket `TB-…` raqami emas, aks holda raqamlarni terib o'quvchilar ismini ko'rib chiqish mumkin bo'lardi). Sahifa faqat shuni ko'rsatadi: «haqiqiy» yoki «bekor qilingan», raqam, ism, daraja, davr, berilgan sana va markaz nomi (filial yo'q). Tug'ilgan sana, foizlar, mock va ilova natijasi ochiq sahifaga chiqmaydi. QR manzili kvitansiyalardagi `publicBaseUrl()` dan olinadi, nusxa ko'chirilmaydi.
- Telegramga yuborish **birinchi versiyada yo'q**.

## 6. Hujjat (PDF)

PDF `pdfmake` bilan (`receipts/pdf/render.ts` dagi mavjud yo'l), nemischa matn, bitta A4 sahifa. Namuna: 17.10.2026, v7 (CEO ko'rigida). Hujjat **DaF Sprachzentrum nomidan** beriladi, filial hech qayerda yozilmaydi.

**Tuzilish (Goethe-Zertifikat'ga o'xshash; Goethe-Institut logotipi, nomi va rangi olinmagan):**
1. Sarlavha qatori: chapda markaz logotipi; o'ngda «DaF Sprachzentrum», «Nr. TB-2026-0001», «Echtheit prüfen: QR-Code scannen» va QR. Ostida to'q ko'k chiziq.
2. «TEILNAHMEBESTÄTIGUNG» (katta harf), ostida «Deutsch als Fremdsprache · Niveau A1»; o'ngda to'q ko'k kvadrat belgi: oq «A1», ostida kichik oltin «NIVEAU».
3. Maydonlar bloki (yorliq chapda, qiymat o'ngda, ostida ingichka chiziq): `Name, Vorname`, `Geburtsdatum`, `Kurs`, `Zeitraum`, `Unterrichtseinheiten`.
4. Tasdiq jumlasi: «hat im genannten Zeitraum regelmäßig am Deutschunterricht auf dem Niveau A1 des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER) teilgenommen.»
5. «Teilnahme im Überblick» jadvali, ustunlar `Bereich / Ergebnis / Erläuterung`: Anwesenheit, Verspätungen, Lernplattform, Abschlusstests, Mock-Prüfung. Ma'lumoti bo'lmagan qator chiqmaydi (3.2, 3.4).
6. Izoh: «Diese Bestätigung bescheinigt die Teilnahme am Kurs. Sie ist kein Sprachzertifikat und ersetzt keine Prüfung.»
7. GER shkalasi A1–C2, hujjat darajasi to'ldirilgan.
8. Pastda faqat «Ausgestellt am 17.10.2026» (oddiy matn, chiziqsiz). Imzo qatori, `Kursleitung`, `Zentrumsleitung`, `Stempel` va joy nomi yo'q.

**Maydon qiymatlari:** `Kurs` — kurs nomi (`Course.name`). `Unterrichtseinheiten` — hisobdagi darslar soni (3.1 maxraji) va, bo'lsa, daqiqasi («à 90 Minuten»: `Group.lessonMinutes`, bo'lmasa `Course.lessonMinutes`); daqiqa noma'lum bo'lsa faqat son. Ism «Familiya, Ism» ko'rinishida; «Herr/Frau» yozilmaydi.

**Rang:** to'q ko'k `#17375E`, oltin `#B8924A` (faqat «NIVEAU», ko'k kvadrat ichida), kulrang matn `#667085`, chiziqlar `#C9CED6`, jadval sarlavhasi `#EEF2F7`. Burchak bezaklari, halqa ko'rsatkichlar va fon qatlami yo'q (v2 rad etilgan, qaytmaydi).

**Shrift (Q7):**
- IBM Plex Serif SemiBold — sarlavha, «A1» belgisi, maydon qiymatlari, «Ergebnis» raqamlari (bitta qalinlik).
- IBM Plex Sans — qolgan matn: `Regular`, `SemiBold` (qalin), `Italic` (izoh).
- Jami 4 fayl (~0,8 MB, OFL litsenziya; litsenziya matni shu papkada): `IBMPlexSerif-SemiBold.ttf`, `IBMPlexSans-Regular.ttf`, `IBMPlexSans-SemiBold.ttf`, `IBMPlexSans-Italic.ttf` → `server/assets/fonts/`. Manba — Google Fonts.
- `receipts/pdf/render.ts` dagi shrift ro'yxatiga ikki oila (`PlexSerif`, `PlexSans`) qo'shiladi; kvitansiya va boshqa shablonlar `Inter` da qoladi.
- O'zbekcha `ʻ ʼ ’ '` va nemis harflari (ä ö ü ß) ikkala oilada bor (`fontkit` bilan tekshirilgan). Plex'da `ʻ` atrofidagi oraliq kengroq ko'rinadi; ism bazadagi yozuvda qanday bo'lsa, shunday chiqadi.

**`pdfmake` eslatmasi:** hujjat oddiy oqimda, fon qatlami yo'q. Fon qatlami kerak bo'lib qolsa: `pageMargins: [0,0,0,0]` va har fon tuguniga `absolutePosition`, aks holda blok sig'masdan jimgina tashlanadi (v2 da topilgan). Bitta sahifaga sig'ish: ixtiyoriy qatorlar hammasi bo'lganda ham (5 qator) namuna sig'di; sahifa chekkasi yuqori 38, past 26, yon 54; sarlavha 24 pt, maydon qiymatlari 12 pt. Plex Serif Inter'dan kengroq, shuning uchun o'lchamlarni oshirish ikkinchi sahifaga olib keladi.

## 7. Administrator ekrani

O'quvchi kartasida yangi tab «Hujjatlar» (tab ma'lumoti faqat ochilganda yuklanadi). Har daraja uchun qator: davomat foizi, ilova foizi, ikkala chegara, yashil/qizil belgi, kech qolish soni. Shart bajarilgan bo'lsa «Hujjat berish» tugmasi; bajarilmagan bo'lsa tugma yopiq va sababi yoziladi («Davomat 74%, kerak 80%»). CEO uchun «Istisno bilan berish» (sabab majburiy). Berilgan hujjatlar ro'yxati: raqam, sana, PDF yuklash.

Sozlamalar sahifasida (faqat CEO, `/settings/participation`, «Qatnashganlik hujjati») bitta davomat chegarasi va A1, A2, B1 uchun ilova chegarasi.

Ekrandagi matnlarda inglizcha so'z yo'q. Dizayn namunasi chizilib CEO ko'radi, keyin quriladi.

## 8. Testlar

- `participation-rules.spec.ts`: jadvalning har qatori (3.1), oldindan aytilgan sababsiz, maxraj 0, chegara aniq 80 va 79,9, ilova qo'llanmaydigan daraja, ilova 100 va 99.
- Servis: bir necha guruhli daraja yig'iladi; boshqa filial o'quvchisi 403; mock bog'lanmagan bo'lsa satr chiqmaydi.
- Kontroller: `@Roles` metadata va `RolesGuard` ruxsat/rad; faqat CEO istisnosi; manifest spec.
- Muhrlash: hujjat berilgach davomat o'zgarsa PDF raqamlari o'zgarmaydi.
- PDF: shablon xatosiz chiziladi, raqam va foiz matnda bor, matnda «filial», «Kursleitung», «Zentrumsleitung», «Stempel» yo'q; barcha ixtiyoriy qatorlar bilan ham bitta sahifa.
- Ochiq sahifa javobida filial va tug'ilgan sana yo'q.

## 9. Ma'lum chegaralar (ochiq masalalar)

1. **Darajani ikki marta o'tgan o'quvchi** (masalan A1 ni takrorlagan): hisob hamma guruhlarni yig'adi. Preview'da guruhlar bo'yicha taqsimot ko'rinadi, administrator ko'zi bilan baholaydi. Davrni qo'lda tanlash keyingi versiyada.
2. **Ilovadan foydalanuvchi kam** (25.09 holatiga 2 o'quvchi). Ilova sharti A1 da amalda ko'pchilikni to'xtatishi mumkin; shuning uchun CEO foizni sozlay oladi va istisno bor.
3. **Daraja imtihoni balli** saqlanmaydi (tizimda joyi yo'q). Kerak bo'lsa alohida kichik maydon qo'shiladi va hujjatda satr bo'ladi.
4. **Mock bog'lash:** qatnashchi o'quvchi kartasiga bog'lanmagan bo'lsa hujjatda chiqmaydi.
5. **Ochiq dars ta'rifi** (3.2) reja bosqichida kodga qarab aniqlashtiriladi.

## 10. Qamrovdan tashqari

Hujjatni bekor qilish yo'li (ustun va ochiq sahifa tayyor, route yo'q), Telegram orqali yuborish, o'quvchining o'zi ilovadan so'rashi, daraja imtihoni balli, hujjat shabloni tillari (faqat nemischa), ommaviy yaratish.
