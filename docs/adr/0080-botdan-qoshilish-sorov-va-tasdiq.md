# ADR-0080 — Botdan o'quvchi o'zi qo'shilmaydi: so'rov va administrator tasdig'i

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0017 (har o'quvchi lid qoldiradi), ADR-0025 (20:00 yig'ma — «darhol qolganlar» ro'yxatiga qo'shiladi), ADR-0033 (karta hisobi bilan tug'iladi), ADR-0054 («Dars bo'ldimi?» — tizim topshirig'i namunasi), ADR-0066 (chat botni rad etishi mumkin), ADR-0074, ADR-0076, ADR-0078, ADR-0079, dizayn `docs/superpowers/specs/2026-10-10-guruhga-qoshilish-tasdigi-design.md`, `server/src/student-join-requests/`, `server/src/tasks/join-request-task.ts`, migratsiya `20261010200000_student_join_request`

## Kontekst

Guruh QR kodi va havolalari (`student_<filial>_group_<guruh>`, `student_<filial>`) imzosiz va muddatsiz. Havola kimga tushsa, o'sha odam botda ro'yxatdan o'tardi va shu zahoti o'quvchi kartasi, guruh, kabinet paroli, oylik hisob va CONVERTED lid yozilardi — hech kim tekshirmasdi.

Prod, 10.10.2026: botdan oyiga ~200 kishi qo'shiladi. Avgust–oktabrda 35 kishi na darsga kelgan, na to'lagan; ulardan 9 tasi guruhdan chiqarilgan, lekin 670 433 so'm qarzi qarzdorlar ro'yxatida qolgan. 6 tasi bir odamning ikkinchi kartasi. Bitta yozuv yopilgan guruhga tushgan: bot guruh holatini o'qimasdi.

## Qaror

1. Botdan ro'yxatdan o'tish **so'rov** bo'ladi (`StudentJoinRequest`). Tasdiqlanmaguncha karta, guruh, hisob, pul va lid o'zgarishi yozilmaydi.
2. Har so'rovga tizim topshirig'i (`TaskKind.JOIN_REQUEST`), «Dars bo'ldimi?» kabi: filial administratorlari (bo'lmasa direktorlar, keyin CEO), birinchi harakat qilgan oladi, CEO va filial direktori har doim javob beradi. Ruxsat — `students.enroll`. Telegram'ga «Ochish» tugmasi bilan boradi; qaror saytda qabul qilinadi.
3. **Tasdiqlash:** administrator filialning o'quvchi qabul qiladigan boshqa guruhini tanlashi mumkin. Karta, guruh va oylik hisob tasdiq kunidan; parol botga yuboriladi. **Rad etish:** sabab majburiy, faqat xodimlarga ko'rinadi; odamga sababsiz xabar boradi. Rad etilgan, muddati o'tgan va almashtirilgan so'rovning rasmi o'chiriladi.
4. **Javobsiz so'rov:** muddat — keyingi ish kuni 10:00; 24 soatdan keyin 21:00 hisobotining «Diqqat» qatori; 7 kunda o'zi yopiladi (`EXPIRED`) va odamga xabar boradi. Hech qachon o'zi tasdiqlanmaydi.
5. Bitta chatga bitta ochiq so'rov (qisman noyob indeks); yangisi eskisini `REPLACED` qiladi.
6. Botning to'rt xabari (qabul qilindi, tasdiqlandi, tasdiqlanmadi, ko'rib chiqilmadi) darhol ketadi — ADR-0025 ning «darhol qolganlar» ro'yxatiga qo'shiladi (bot oqimlari, `src/telegram/`).
7. Bot guruh holatini (`ENROLLABLE_GROUP_STATUSES`: ACTIVE, FORMING, PAUSED — admin eshigi va lid aylantirish bilan bitta ro'yxat) va ustoz holatini tekshiradi.

## Ko'rib chiqilgan muqobillar

- **Imzolangan, 3 kunlik havola** (ADR-0029 kabi): muddat ichida havola baribir hammaga ishlaydi.
- **Har o'quvchiga bir martalik havola:** administrator har kartani oldindan qo'lda ochishi kerak bo'lardi — o'zi ro'yxatdan o'tishning ma'nosi qolmaydi.
- **Kartani «kutilmoqda» holatida yozish:** har ro'yxat, hisobot va hisob-kitob yangi holatni o'rganishi kerak bo'lardi.
- **Avtomatik tasdiqlash yoki muddatsiz kutish:** birinchisi himoyani yo'qqa chiqaradi, ikkinchisida odam javob olmaydi.
- **Telegram tugmasi bilan tasdiqlash:** keyinga. Karta va pul yozadigan amal saytda qoladi.

## Oqibatlari

- Deploydan keyin botdan kelgan har odam administratorni kutadi: ikki filialda kuniga ~7 so'rov.
- Kutish paytida o'quvchi ustozning davomat ro'yxatida yo'q — tez javob berish kerak.
- Ota-onaning ikkinchi farzandi botdan yozilmaydi, avvalgidek: chat ham, telefon ham band.
- `registerStudentFromTelegram` endi faqat tasdiqdan chaqiriladi; tarix qatorlari va lid tasdiqlagan xodim bilan yoziladi.
- Hozirgi 9 ta «havodagi qarz» bu qaror bilan tozalanmaydi — alohida qaror.
