# ADR-0042 — Oylik to'lov xabari: hisob kuni va 2-dars eslatmasi (Telegram)

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0025, `server/src/billing/monthly-payment-notice.service.ts`, `server/src/billing/monthly-payment-notice-cron.service.ts`, `server/src/telegram-digest/monthly-payment-text.ts`, `EnrollmentMonthlyCharge.noticeQueuedAt`, sozlama `payment.monthlyNoticesEnabled`

## Kontekst

01.09.2026 dan barcha kurslar oylik to'lovda. Shartnoma bo'yicha oylik to'lov
oyning 2-darsigacha qilinadi. O'quvchiga qarz haqida xabar beruvchi yagona yo'l
(`DEBT_CHARGE`) 12 talik paket davomatiga bog'langan va oylik kursda hech qachon
ishlamaydi: o'quvchi oyning to'lovi haqida hech narsa olmaydi. CEO 27.09.2026 da
ikki xabar matnini tasdiqladi (spec §A5).

## Qaror

1. Kunlik 20:00 jamlanmaga (ADR-0025) ikki yangi toifa: `MONTHLY_CHARGE` (oy
   hisobi) va `PAYMENT_REMINDER` (2-darsdan bir kun oldingi eslatma).
2. Navbatga yozuvchi — alohida cron, har kuni 19:50 (yakshanba va bayramda ham):
   - hisob: `noticeQueuedAt` bo'sh, `CHARGED`, oxirgi 3 kunda yozilgan yoki
     qayta hisoblangan har bir hisob bitta tranzaksiyada «egallanadi»
     (`noticeQueuedAt` yoziladi) va navbatga qo'yiladi — cron necha marta
     yurmasin, hisob bir marta e'lon qilinadi. Bekor qilinib qayta hisoblangan
     oy belgisini yo'qotadi va yana e'lon qilinadi;
   - oy O'QUVCHINIKI, yozilishniki emas: faqat o'quvchining shu oydagi birinchi
     hisobi e'lon qilinadi. Oy o'rtasida guruhi almashtirilgan o'quvchining
     ikkinchi hisobi faqat belgilanadi — uning to'lov muddati birinchi
     guruhdagi 2-darsda o'tgan;
   - eslatma: qarzdor, ochiq yozilish, faol guruh, ertangi dars o'quvchining shu
     oydagi 2-darsi bo'lsa. 2-dars o'quvchining shu oydagi (istalgan guruhdagi)
     birinchi darsidan sanaladi, guruhning JONLI kalendari bo'yicha — hisobdan
     keyin bekor qilingan dars eslatmani suradi. Hisobdagi «Muddat» ham xuddi
     shu qoida bilan hisoblanadi.
3. 20:00 da matn jonli ma'lumotdan yoziladi: qarz va «Jami to'lash kerak»
   balansdan; hisob bekor qilingan yoki o'quvchi guruhdan chiqqan/muzlagan
   bo'lsa hisob xabari ketmaydi; to'lagan o'quvchiga eslatma ketmaydi;
   eslatma faqat ertangi dars uchun.
4. Migratsiya deploy kunidan (Toshkent) oldin yozilgan hisoblarga
   `noticeQueuedAt` yozadi: birinchi yurishda hech kimga boshlanib bo'lgan oy
   uchun hisob ketmaydi, lekin hisob kuni deploy qilinsa o'sha kungi hisoblar
   e'lon qilinadi.
5. `payment.monthlyNoticesEnabled` (kompaniya darajasi, boshlang'ich yoqilgan)
   ikkala xabarni o'chiradi. O'chiq paytda hisoblar faqat belgilanadi — qayta
   yoqilganda eski hisoblar yuborilmaydi.

## Oqibatlar

- O'quvchi oy boshida qancha to'lashini va muddatini, to'lamasa — 2-darsdan bir
  kun oldin eslatma oladi. Telegram bog'lanmagan o'quvchiga hech narsa ketmaydi.
- 19:50 dan keyin yozilgan hisob (kechki qo'shilish) ertasi kuni e'lon qilinadi.
- 19:50 yurishi yiqilsa, hisoblar keyingi kuni ketadi (3 kun ichida); eslatma
  o'sha kun uchun yo'qoladi.
- Guruhi oy o'rtasida almashtirilgan o'quvchi yangi hisob xabari va yangi
  muddat olmaydi; yangi guruh haqida «Guruhga qo'shildingiz» xabarini oladi.
- `payment.chargeDayOfMonth` 1 dan katta qilinsa, hisobdan oldin tushgan
  2-dars uchun eslatma ketmaydi va hisobda «Muddat» qatori chiqmaydi.

## Rad etilgan variantlar

- **Navbatni hisob tranzaksiyasi ichida yozish.** Pul yozuvi xabar yozuviga
  bog'lanib qolardi: xabar jadvalidagi xato oylik hisobni to'xtatardi.
- **Hisobdan keyin hodisa chiqarish.** Hisob yoziladigan har bir yo'lga
  tranzaksiyadan keyingi hodisa qo'shish kerak edi; bittasi unutilsa xabar
  jimgina yo'qoladi.
- **Belgisiz, vaqt oynasi bo'yicha tanlash.** 19:50 da deploy yoki qayta ishga
  tushish o'sha kungi hamma hisob xabarini yo'qotardi.
