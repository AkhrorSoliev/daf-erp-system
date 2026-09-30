# ADR-0047 — Davomat dars tugashi bilan yopiladi; to'lov qilmagan o'quvchi 2-darsdan puli yetgan darslargacha qatnashadi

**Holati:** Qabul qilindi; 1-banddagi «dars tugagach hech kim, CEO ham, kirita va o'zgartira olmaydi» va `allowClosedLesson`, 6-banddagi «endi saytda kiritib bo'lmaydi» xabarlari — ADR-0054 bilan o'zgardi (CEO, 2026-09-30); «10 daqiqa» — ADR-0048 5-band (sozlama)
**Sana:** 2026-09-27
**Bog'liq:** shartnomaning 3.2 va 5.1-bandlari; ADR-0042 (2-dars eslatmasi), ADR-0044 (40% qoidasi); `server/src/attendance/shared/attendance-window.ts`, `server/src/attendance/shared/attendance-window-guard.ts`, `server/src/billing/lesson-admission.ts`, `server/src/billing/lesson-admission.service.ts`, `client/src/lib/attendance-window.ts`

## Kontekst

Davomat vaqti faqat bugungi sana uchun tekshirilardi, administrator, filial
direktori va CEO esa vaqtdan butunlay ozod edi. Sentabrda davomatning sezilarli qismi dars
tugagandan keyin kiritilgan (asosan administrator, ba'zan ertasi kuni),
administratorlar tugagan darslarni tuzatgan, ayrim darslar umuman davomatsiz
qolgan.
«Davomat olinmagan darslar» ro'yxati eski darsga kiritishga undardi, dars
oxiridagi xabarlar ustozga ham, administratorga ham «tiklang» derdi.

Oylik hisobda qarzdorning har belgilangan darsi ustozga yozilardi (oy hisobi
tranzaksiyasi qoplama sifatida o'tadi), o'quvchi hech qachon to'lamasa ham.
Markaz to'lanmagan hamma darsni jimgina qoplardi. Shartnomaning 3.2-bandi esa
oyning 1-darsidan keyin qarzdorni darsga qo'ymaydi.

## Qaror

1. **Davomat oynasi** — dars boshlanishidan 10 daqiqa oldin ochiladi, dars
   tugashi bilan yopiladi (Toshkent vaqti; ko'chirilgan darsning o'z
   vaqtlari). Hamma rol uchun bir xil: ustoz bir marta oladi, administrator,
   filial direktori va CEO oyna ichida oladi va tuzatadi. Oynadan tashqarida
   saqlash, QR sessiya va skan rad etiladi; oldindan belgilash dars tugaguncha
   mumkin. Yagona istisno — `allowClosedLesson`: uni faqat CEO buyrug'i bilan
   ishlatiladigan dastur beradi, saytdagi hech bir yo'l bermaydi.
2. **Darsga qo'yish (01.10.2026 dan, oylik kurs).** O'quvchining shu guruhdagi
   oydagi 1-darsi — to'lovsiz. 2-darsdan boshlab o'quvchi D kuni darsga
   qo'yiladi, agar `balans + oyning D dan keyingi darslari qiymati ≥ 0` bo'lsa.
   Qiymat `departureRelease` bilan bir xil: chegirmali, muzlatilganlari
   chiqarilgan, hisob bilan cheklangan; faqat FAOL yozilishlarning CHARGED
   hisoblari. Ya'ni bugungacha bo'lgan darslar va eski qarz to'langan (to'lov
   avval eng eski qarzni yopadi). To'lov va'dasi hech kimni darsga qo'ymaydi;
   to'lovsiz muddat cho'zilmaydi. Oy uchun hisob hali yozilmagan bo'lsa, qoida
   o'sha guruhda qo'llanmaydi.
3. **Qo'yilmagan o'quvchi** ro'yxatda qoladi, lekin «Keldi», «Kelmadi»,
   «Kechikdi» rad etiladi; «Sababli» (oldindan xabar) mumkin; umuman
   belgilanmasligi ham mumkin — to'liq ro'yxat talabi uni o'tkazib yuboradi.
   O'zgarmagan belgi qayta tekshirilmaydi. QR skan ham rad etiladi.
4. **Ustoz haqi.** Qo'yilmagan dars uchun davomat qatori yo'q — haq
   yozilmaydi, o'quvchi keyin to'lasa ham. 2-darsdan qo'yilgan har dars puli
   to'langan. Qarzdorning 1-darsini markaz qoplaydi (avvalgidek).
5. **Qisman to'lov.** To'lov oynasi summa qaysi darsgacha yetishini va
   keyingi darsga yana qancha kerakligini ko'rsatadi; qarz qolsa, qolgan
   qismi uchun va'da sanasi so'raladi va to'lovdan keyin o'quvchining ochiq
   va'dasi yoziladi. Va'da yozilmay qolsa ham to'lov saqlanadi.
6. **Xabarlar.** Dars tugashidan 30 daqiqa oldin ustozga «olinmasa haq
   yozilmaydi», administratorga «siz olsangiz ustoz haqi saqlanadi»; dars
   oxirida ikkalasiga «olinmadi, endi saytda kiritib bo'lmaydi».

**Taqiqlanadi:**
- biror rolni davomat oynasidan ozod qilish;
- to'lov va'dasi bilan darsga qo'yish;
- darsga qo'yish qoidasini `lessonAdmission` dan boshqa joyda hisoblash.

## Ko'rib chiqilgan muqobillar

- **Dars tugagach o'sha kuni tuzatish**. CEO rad etdi:
  dars tugashi bilan hammasi yopiladi.
- **Dars tugagach 15 daqiqa qo'shimcha vaqt** (kechikib kiritilganlarning bir
  qismi shu ichida). Qoida «dars tugaguncha» deydi; 30 daqiqa oldingi eslatma bor.
- **Va'da bilan darsga qo'yish (muddat uzaytirish).** CEO rad etdi: to'lovsiz
  hech narsa yo'q; faqat qisman to'lovda qolgan qismi uchun va'da yoziladi.
- **Qarzdorni `balans < 0` bo'yicha to'sish.** Qisman to'lagan o'quvchini
  to'lagan darslariga ham qo'ymasdi.

## Oqibatlari

**Yutuq:** ustoz davomatni dars ichida oladi; markaz to'lanmagan darslarni
qoplamaydi (1-darsdan tashqari); administrator o'quvchiga aniq summa aytadi.

**Narx:**
- Dars tugagach aniqlangan xato faqat CEO buyrug'i bilan dastur orqali
  tuzatiladi.
- Administrator yangi o'quvchini dars ichida ro'yxatga qo'shishi kerak.
- 1-oktabrdan 2-darsgacha to'lamaganlar darsga kirmaydi (A5 eslatmasi bir
  kun oldin boradi).
- Kechikish daqiqasi, «Berilmadi» bloki, sinov darsi (3.5) va qarzdorning
  1-darsga kelmagani uchun ustoz haqi keyingi bosqichda.
