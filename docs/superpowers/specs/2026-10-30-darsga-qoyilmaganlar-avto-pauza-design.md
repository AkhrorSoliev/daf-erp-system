# Darsga qo'yilmagan o'quvchi: profilda belgi, xabarlar, 3 darsdan keyin pauza, qaytishda darslarni belgilash

Sana: 2026-10-30. Holati: loyiha, CEO ko'rigini kutadi.
Bog'liq: ADR-0047 (darsga qo'yish), ADR-0064 (50% talab), ADR-0062 (oylik hisob), ADR-0023 (avto-pauza), ADR-0141 («Darsga qo'yilmayotganlar» tabi), shartnoma 3.2, 3.5, 6.2.

## 1. Muammo

To'lamagan o'quvchi oyning 2-darsidan darsga qo'yilmaydi va davomatda unga belgi qo'yib bo'lmaydi (ADR-0047). Natija:

- Davomat qatori yo'q, shuning uchun o'quvchi profilidagi «Darslar» tabida bu kunlar bo'sh qoladi, nega kelmagani ko'rinmaydi.
- Avto-pauza (ADR-0023) faqat ketma-ket 3 ta «Kelmadi» belgisini sanaydi, shuning uchun bu o'quvchi hech qachon pauzaga tushmaydi.
- «Ko'rinmadingiz» xabarlari ham «Kelmadi» belgisiga bog'liq, shuning uchun o'quvchiga hech narsa aytilmaydi.
- Oylik hisob butun oyni yozib turadi. O'quvchi chiqarilganda 6.2 qoidasi (kalendar bo'yicha 40% dan keyin pul qaytmaydi) o'ziga yopiq darslar pulini ham ushlab qoladi (#10918: 450 000 so'm, 1 dars).

ADR-0141 tabi bu o'quvchilarni admin uchun ko'rinadigan qildi. Bu spec ularni tizim o'zi ham ko'radigan va hal qiladigan qiladi.

## 2. Qoidalar (CEO bilan kelishilgan, 30.10.2026)

### 2.1 «Darsga qo'yilmagan dars»

Guruhning o'tgan kuni shu o'quvchi uchun «darsga qo'yilmagan dars» deyiladi, agar:

1. oylik hisobning shu kuni bor (`coveredDates`) — frozenOut bo'lsa ham, chunki ko'rsatish uchun kerak;
2. ustoz shu kuni guruhga davomat olgan (boshqa o'quvchilarda bekor qilinmagan qator bor);
3. o'quvchining o'zida shu kunga hech qanday davomat qatori yo'q;
4. o'quvchi shu kuni darsga qo'yilmagan edi: `LessonAdmissionService.forLesson` hukmi `NOT_PAID` yoki `BELOW_MIN_SHARE`. Balans manfiyligi emas, hukm ishlatiladi. Shunda 213 so'mlik mayda qarzlar kirmaydi va 01.11 dan 50% talab hisobga olinadi.

`unmarkedLessonDays` (ADR-0141) shu qoidaning 1–3-bandlarini bajaradi. 4-band yangi.

### 2.2 Profil → «Darslar» tabi

Davomat olib bo'lmagan har kun **binafsha** nuqta bilan chiqadi, belgilar qatorida nomi «To'lov yo'q». Nuqta ustiga bossa: sana, yumshoq sabab «To'lov yo'qligi uchun davomat olib bo'lmadi» va «Shartnoma 3.2» havolasi. Pauzada hisobdan chiqarilgan kun uchun qo'shimcha: «Hisobdan chiqarilgan» (halqali nuqta). «Qaytarilgan» so'zi ishlatilmaydi: u o'quvchini qaytarish bilan adashtiradi. Hisob «N/M keldi» ga ta'sir qilmaydi (kelmagan, lekin «kelmadi» ham emas).

Til qoidasi (CEO, 30.10): «darsga qo'yilmadi» deyilmaydi. Ekranda va xabarda: «to'lov yo'qligi uchun davomat olib bo'lmadi» / «ketma-ket 3 ta darsda davomatni belgilab bo'lmadi».

### 2.3 Ketma-ket sanash va xabarlar

Hisoblash `AbsenceStreakService` ichida, yagona ta'rifda qoladi: darsga qo'yilmagan kun ham «Kelmadi» kabi sanaladi. «Keldi», «Kech» va «Sababli» ketma-ketlikni uzadi. Aralash ketma-ketlik (bir kun «Kelmadi», keyingisi darsga qo'yilmagan) ham sanaladi.

Xabarlar mavjud 3 bosqichda, mavjud vaqtlarda (kechki 20:30 va ertalabki 07:30) va `AbsenceWarningLog` bilan (bir dars, bir xabar):

1. Birinchi darsga qo'yilmagan dars: «ko'rinmadingiz» (yumshoq).
2. Ikkinchi: ogohlantirish, «yana 1 ta dars qolsa joyingiz vaqtincha to'xtatiladi».
3. Uchinchi: pauza xabari.

Format davomat «Kelmadi» xabaridan farq qiladi: ohang yumshoq, sabab (to'lov hali ko'rinmayapti) aytiladi, filial raqami beriladi. **Xabarda summa yo'q**: o'quvchi summani administratordan so'raydi. Matnlar artifactda.

### 2.4 3-darsda: pauza va pul

3 ta ketma-ket dars bo'lsa, ertalabki 07:30 yurishida:

1. O'quvchi pauzaga tushadi: mavjud `pauseForAbsence` (student-level `FROZEN`, tizim aktori). Joyi guruhdan bo'shaydi. Sabab matni: «Avtomatik pauza: 3 ta ketma-ket darsda to'lov yo'qligi uchun davomat olib bo'lmadi».
2. Darsga qo'yilmagan kunlarning puli bo'shatiladi (`releaseBarredLessons`, yangi). Kelgan (davomat qatori bor) darslar puli qoladi — bu o'quvchining haqiqiy qarzi. Qolgan oyning o'tmagan darslari pulini odatdagidek qaytaradi (`CENTER_INITIATIVE`).
3. 6.2 va 3.5 qoidalari bu yo'lda ishlamaydi: markaz o'quvchini darsga qo'ymagan, shuning uchun kalendar ulushi va sinov darsi emas, faktik kelgan darslar hisoblanadi. #10918 shu qoida bilan hisoblangan (1 dars = 34 615).
4. Hech kelmagan bo'lsa qarz 0 bo'ladi.
5. O'quvchi «Aloqa markazi → Pauzadagilar» tabiga tushadi (mavjud, avtomatik sabab prefiksi bo'yicha). Adminlar va ustozga mavjud bildirishnoma boradi.

Kunlik chegara (fail-closed) saqlanadi: nomzod chegaradan ko'p bo'lsa hech kim pauzaga tushmaydi, CEO ogohlantiriladi.

### 2.5 Qo'ng'iroqdan keyin

Pauzadagi o'quvchi bilan telefonda bog'langach admin ikki yo'ldan birini tanlaydi (mavjud tugmalar):
- **Qaytarish** (holatni «Faol» qilish yoki boshqa guruhga qo'shish) — 2.6.
- **Yakuniy chiqarish** (guruhdan chiqarish/chetlatish) — pul allaqachon hisoblangan, qo'shimcha pul harakati bo'lmaydi.

### 2.6 Qaytishda darslarni belgilash

O'quvchi qaytganda («Faol» qilish yoki «Guruhga qo'shish») va unda pauzada hisobdan chiqarilgan kunlar bo'lsa, oyna ochiladi: «O'quvchi qaysi darslarga kelgan edi?». Matn: «Pauza paytida N ta dars hisobdan chiqarilgan edi, chunki o'sha kunlarda to'lov yo'qligi uchun davomat olib bo'lmagan. Kelgan kunlarni belgilang: ular qarzga qaytadan qo'shiladi.» Kunlar ro'yxati, har biriga katak (belgilanmagan kun: «hisobda yo'q», belgilangan: «+narx qarzga»).

- Belgilangan kun: puli qayta yoziladi (dars narxi, chegirma bilan), kun `frozenOutDates` dan chiqadi, o'quvchiga shu kun uchun «Keldi» davomat qatori yoziladi (ustoz haqi shundan hisoblanadi, "Bo'ldi" yo'li kabi), tarixga yoziladi.
- Belgilanmagan kun: bo'shatilgan holda qoladi.
- Qo'shilayotgan guruh boshqa bo'lsa ham oyna chiqadi (pul eski guruhning kunlari uchun).
- Oyna majburiy: admin hech bo'lmasa «hech biriga kelmagan» tugmasini bosadi, shunda qaror izi qoladi.

### 2.7 Eski holatlar

Bir martalik skript (`dry-run` standart): 2.1–2.3 qoidasiga mos kelgan o'quvchilarni topadi (hozirgi ro'yxat taxminan 33 ta), har biri uchun: necha ketma-ket dars, kelgan darslar, bo'lishi kerak bo'lgan qarz va hozirgi farq. CEO ro'yxatni ko'rib tasdiqlamaguncha hech narsa yozilmaydi, xabar yuborilmaydi. `--apply` faqat `--expect=N` bilan.

### 2.8 Yoqish

CEO sozlamasi: bitta tanlov (radio) emas, **mustaqil katakchalar** (checkbox), chunki qismlar alohida yoqiladi. Hammasi standart o'chiq, faqat «Profilda belgi va hisobot» va «Xabarlarni faqat logga yozish (sinov)» yoqilgan holda boshlanadi.

| Katak | Nima qiladi | Talab qiladi |
|---|---|---|
| `mark` Profilda belgi va hisobot | binafsha nuqta, «Darsga qo'yilmayotganlar» tabi, eski holatlar hisoboti | — |
| `nudge` 1-dars xabari | birinchi yumshoq eslatma | `mark` |
| `warn` 2-dars xabari | ikkinchi eslatma | `mark` |
| `autoPause` Avto-pauza | 3 ta ketma-ket darsdan keyin pauza va pul | `mark` |
| `pauseNotice` 3-dars xabari | pauza haqida xabar | `autoPause` |
| `restoreDialog` Qaytishda kunlarni so'rash | qaytish oynasi | `mark` |
| `logOnly` Xabarlarni faqat logga yozish | xabar tayyorlanadi, yuborilmaydi | — |

Talab qilinadigan katak o'chsa, unga tayanganlar ham o'chadi; talab bajarilmaguncha katak bosilmaydi va nima kerakligi yoziladi. Sonlar (3 ta dars, ogohlantirish, kunlik chegara) mavjud «Avtomatik pauza» sozlamasidan olinadi. Umumiy `AbsencePauseSetting.enabled` ham yoqilgan bo'lishi kerak; u hozir prodda o'chiq, shuning uchun yangi qoida o'z-o'zidan yoqilmaydi.

### 2.9 Shartnoma bandi doim havola

Tizimda shartnomaning biror bandi tilga olingan har joyda (tab belgisi, pauza sababi, pul hisobi, qaytish oynasi, sozlama) band raqami **havola** bo'ladi: «Shartnoma 3.2». Admin bossa, bandning to'liq matni oynada ochiladi va u butun qoidani o'qib chiqadi.

- Bitta umumiy komponent `ContractClauseLink`. Havola qo'lda yozilmaydi.
- **Matn manbasi — tizimdagi eng so'nggi shartnoma:** `server/src/contract-documents/pdf/contract-template-v1.ts` (`BODY_SECTIONS`, ADR-0075). Tizim shartnomani aynan shundan tuzadi, shuning uchun havola ko'rsatgan matn va o'quvchi imzolagan matn bir xil bo'ladi. Ikkinchi nusxa yozilmaydi: server `GET /contract-documents/clauses?nos=3.2,6.2` shu massivdan «3.2.» kabi boshlanishi bo'yicha bandni ajratib beradi (`@Can` — admin ekranlari qaysi capability bilan ochilsa shu, o'qish).
- Bandlar: 3.2 (darsga kirish), 3.5 (sinov darsi), 6.2 (chiqarish va pul), 5.1 va 3.7 (agar tilga olinsa).
- Bandlar: 3.2, 3.5, 3.7, 5.1, 6.2, 6.3. Repodagi eski docx emas, yuqoridagi manba ishlatiladi.
- Havola faqat admin ekranlarida. O'quvchiga boradigan xabarda band raqami yo'q (yumshoq ohang).

## 3. Texnik reja (qisqa)

- `server/src/attendance/barred-lessons.ts` (sof qoida) + `barred-lessons.service.ts`: o'quvchi/guruh uchun darsga qo'yilmagan kunlar, hukm bilan.
- `students-read.service.ts` `getLessonsOverview`: darsga qo'yilmagan kunlar `status: 'BARRED'` bilan qo'shiladi.
- `absence-streak.service.ts`: darsga qo'yilmagan kun «Kelmadi» kabi sanaladi (`reason` maydoni bilan).
- `absence-pause-notify.service.ts`: darsga qo'yilmaganlar uchun alohida matnlar.
- `monthly-charge.service.ts`: `releaseBarredLessons` va `restoreBarredLessons` (backdating himoyasiga bog'liq emas, chunki o'tgan kunlar).
- `students-status.service.ts`: `pauseForAbsence` darsga qo'yilmaganlik sababi bilan bo'shatishni chaqiradi, bir tranzaksiyada.
- Qaytarish: `POST /students/:id/barred-lessons/restore` (`students.manage`), oyna `restore-barred-lessons-dialog.tsx`, `ChangeStatusDialog` va `EnrollToGroupDialog` ichida ochiladi.
- Yangi jadval kerak emas: bo'shatilgan kunlar `frozenOutDates` va pauza kunidan oldingi, qatorsiz, o'tkazilgan dars kunlaridan chiqadi.
- ADR-0142 shu ish bilan bir PR'da.

## 4. Xavflar va ochiq joylar

- **Shartnoma bilan ziddiyat (CEO qarori kerak).** Eng so'nggi shartnoma matni (`contract-template-v1.ts`) bu holatni o'zi tartibga soladi, va 2.4/2.6 dagi pul qoidasidan farq qiladi:
  - **3.2:** to'lov bo'lmagani uchun qatnashilmagan darslar «Buyurtmachi aybi bilan qoldirilgan» hisoblanadi, **qayta tiklanmaydi, oylik to'lov qayta hisoblanmaydi, qarz bekor qilinmaydi**.
  - **6.3:** 3.2 bo'yicha darsga qo'yilmagan o'quvchi shundan keyin **14 kalendar kun** ichida qaytmasa, shartnoma xizmat to'xtagan kundan bekor qilingan hisoblanadi va 6.2 shu sana bo'yicha qo'llanadi.
  - Spec esa pauza paytidayoq (3-darsdan keyin) belgilab bo'lmagan kunlarni hisobdan chiqaradi va qaytganda faqat admin belgilagan kunlarni qarzga qo'shadi. Shartnomaga ko'ra: pauzada pul 14 kun turadi; qaytsa, belgilab bo'lmagan kunlar ham to'lanadi; qaytmasa, 14-kuni to'xtagan sana bo'yicha 6.2 qo'llanib, o'sha sanadan keyingi kunlar puli chiqadi (#10918 natijasi bilan bir xil).
  - Variantlar: (A) shartnomaga moslash: 14 kunlik kutish, avto-bekor; (B) spec bo'yicha davom etish va shartnoma 3.2/6.3 ni o'zgartirish (CEO va yurist); (C) pauzada darhol chiqarish, lekin qaytganda admin tanlovi faqat CEO ruxsati bilan.

- **Hukm tarixi.** `forLesson` o'tgan kunni hozirgi balans bilan baholaydi. To'lov keyin kelgan bo'lsa o'quvchi "qo'yilgan" ko'rinadi. Tavsiya: kunlar hisobi pauza paytida bir marta qotiriladi (bo'shatish metadata'siga yoziladi).
- **Hisob-kitob va 6.2.** Bu yo'l 6.2 va 3.5 ni chetlab o'tadi (2.4-band). Aloqa markazidan qo'lda chiqarish hali 6.2 bilan ishlaydi; ular o'rtasidagi farq ADR'da yoziladi.
- **Ustoz haqi.** Darsga qo'yilmagan kun uchun ustozga haq yozilmagan va yozilmaydi; faqat qaytishda belgilangan kun uchun yoziladi.
- **Ko'p guruhli o'quvchi.** Har guruh alohida sanaladi; pauza esa student-level, ya'ni hamma guruhdan chiqaradi. Bu mavjud avto-pauza xulqi bilan bir xil (har o'quvchida 1 ta faol yozilish).
- **Tezlik.** Hisob faqat qarzdor ACTIVE yozilishlar uchun (taxminan 33 ta) va 31 kunlik oynada.
