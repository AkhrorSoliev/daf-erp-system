# ADR-0063 — Bekor qilishni o'chirish qaytarilgan dars pulini ham qaytarib oladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** ADR-0053 (5-band shu ADR bilan o'zgardi), ADR-0054, `server/src/billing/cancelled-lesson-release.ts` (`restoreCancelledLesson`), `server/src/lesson-cancellations/lesson-cancellations.service.ts` (`remove`)

## Kontekst

ADR-0053 ning 5-bandi: bekor qilishni o'chirish to'lovni tiklamaydi, dars
aslida o'tgan bo'lsa admin davomatni qo'lda oladi. Oylik to'lov modelida bu
ishlamaydi: davomat pul yechmaydi, oyning puli oldindan yozilgan. Bekor qilish
kunni `frozenOutDates` ga qo'shgan, kun u yerda qoladi. Shuning uchun o'chirishdan
keyin «Bo'ldi» deyilsa ham dars puli olinmaydi va dars o'quvchiga tekin bo'ladi.

01.10.2026 da CEO Farg'ona filialida turib /tasks dan Namangan guruhlarining
8 ta «Dars bo'ldimi?» savolini ochdi. Guruh sahifasi faqat tanlangan filialda
qidirgani uchun «Guruh topilmadi — guruh mavjud emas» deb chiqdi. CEO darslarni
«guruh mavjud emas» degan sabab bilan bekor qildi va 58 o'quvchiga 1 667 518
so'm qaytdi. Holbuki guruhlar faol, ularda 29.09 da davomat olingan. Xatoni
tuzatish uchun bekor qilishni o'chirish kerak edi, lekin qoida bo'yicha pul
o'quvchilarda qolardi.

## Qaror

1. Bekor qilish o'chirilganda (`DELETE /lesson-cancellations/:id`) o'sha
   tranzaksiya ichida quyidagilar qilinadi:
   - shu bekor qilish yozgan har bir `monthly-release` ADJUSTMENT teskari
     qilinadi, ya'ni pul balansdan qayta yechiladi;
   - kun `frozenOutDates` dan chiqadi;
   - `chargedAmount` va `coveredLessons` tiklanadi;
   - qaytarishda olingan keyingi oy krediti qaytariladi. Buni yangi
     `creditTakenBack` belgisi aytadi.
2. Qaytarilgandan beri hisob yoki yozilish o'zgargan bo'lsa, pul o'quvchida
   qoladi. Bunga uch holat kiradi:
   - hisob CHARGED emas;
   - kun allaqachon qayta hisoblangan;
   - yozilishning holati o'zgargan: muzlatish, chiqish yoki ko'chish
     (`EnrollmentStateLog`).

   Bunday holatda kunni o'z hisobidan muzlatish yoki chiqish chiqargan bo'lishi
   mumkin. Qayta hisoblansa, o'quvchi o'tmagan kun uchun pul to'lardi. Pul
   qoldirilgan o'quvchilar soni javobda va bekor qilishning tarixida yoziladi.
3. ADR-0053 ning qolgan qoidalari o'zgarmaydi. Davomat, `LESSON_CONSUMPTION`
   va ustoz hisoblari tiklanmaydi. Dars «Dars bo'ldimi?» savoliga qaytadi
   (ADR-0054).

## Oqibatlar

- Xato bekor qilish to'liq tuzatiladi. O'chirilgach, savol filial
  administratorlariga qayta ochiladi. Ular «Bo'ldi» desa, pul yechilgan holda
  qoladi. «Bo'lmadi» desa, pul yana qaytadi.
- O'chirishdan keyin o'quvchining balansi kamayadi va u qarzdor bo'lib qolishi
  mumkin. Guruh sahifasidagi tasdiq oynasi buni aytadi.
- Bekor qilish bilan o'chirish orasida muzlatilgan, guruhdan chiqqan yoki
  ko'chgan o'quvchining puli qaytarib olinmaydi. Uni qo'lda ko'rib chiqish kerak.
- 29.09–02.10 oralig'idagi 112 ta qaytarishning birortasida EXCUSED davomat
  bo'lmagan, ya'ni kredit olinmagan. Shuning uchun eski yozuvda `creditTakenBack`
  yo'qligi aniq: u yozuvlarda kredit qaytarilmaydi.
- Shu ish bilan birga UI ham tuzatildi. Tanlangan filialda topilmagan guruh
  foydalanuvchining boshqa filialida bo'lsa, `GET /groups/:id` 404 javobida shu
  filialni aytadi. Sahifa «Guruh boshqa filialda» deb yozadi va filialga o'tish
  tugmasini ko'rsatadi. /tasks kartasi tizim topshirig'ining filialini
  ko'rsatadi.

## Ko'rib chiqilgan va rad etilgan

- **Faqat shu 8 ta bekor qilish uchun bir martalik skript** — keyingi xato
  bekor qilishda muammo yana takrorlanardi.
- **Kunni yozilish tarixiga qarab tahlil qilish** (muzlatish kuni darsdan oldin
  yoki keyin bo'lganini aniqlash) — shartnoma 6.2 va 3.5 siyosatlari bilan
  natija noaniq bo'lardi. Holat o'zgargan bo'lsa pulni qoldirish soddaroq va
  xavfsiz.
- **/tasks ni tanlangan filial bo'yicha filtrlash** — CEO va bir nechta
  filialdagi administrator o'z topshiriqlarining bir qismini ko'rmay qolardi.
  Kartadagi filial nomi va o'tish tugmasi yetarli.
