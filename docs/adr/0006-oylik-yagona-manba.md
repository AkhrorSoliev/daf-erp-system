# ADR-0006 — Ustoz oyligi faqat `getMonthly` dan o'qiladi

**Holati:** Qabul qilindi
**Sana:** 2026-07-05
**Bog'liq:** `server/src/salary/salary-monthly.service.ts`, PR #352, PR #363

## Kontekst

Ustoz oyligi bir necha joyda mustaqil hisoblanardi: oylik sahifasi, Telegram hisoboti, moliya kartasi, prognoz skripti. Har biri o'z formulasiga ega edi va ular **chetlashardi** — bir xil oy uchun bir necha xil raqam.

Alohida nuqson: eski shakl **har bir** accrual'ni `covered` ga qo'shardi. Cron iyulni yopgan kecha u markazning **o'z pulidan 15.5 mln so'mni** «o'quvchilar to'lagan» deb ko'rsatdi va markaz qo'shimchasini 0 qilib chiqardi.

## Qaror

`SalaryMonthlyService.getMonthly` — ustoz oyligining **yagona manbasi**. Oyni ko'rsatadigan yoki to'laydigan har qanday joy shu yerdan o'qiydi.

Oy daromadi **moliyalashtiruvchi bo'yicha** bo'linadi, va bo'linish oy yopilgan-yopilmaganidan qat'i nazar **bir xil** hisoblanadi:

- `covered` — o'quvchi to'lovi qoplagan accrual'lar (`wasCenterTopUp` false)
- `centerFunded` — yozilgan markaz qo'shimcha accrual'lari **plyus** hali accrual'siz hisoblanadigan darslar × stavka
- `fullDeserved` — `covered + centerFunded` (o'tilgan barcha darslar × stavka)
- `advances` — kalendar oy ichida berilgan `TEACHER_ADVANCE`
- `netToPay` — baza − avanslar, yoki yopilgan oyning haqiqiy to'lovi

**Oyni yopish faqat bitta narsani qiladi:** pulni `centerFunded` ning ikkinchi hadidan birinchisiga ko'chiradi. Boshqa hech narsa o'zgarmaydi — davom etayotgan oy markaz ulushini butunlay prognoz sifatida, yopilgan oy butunlay yozilgan accrual sifatida olib yuradi, va yig'indilar chegarada mos keladi.

**Raqam to'qilmaydi.** Per-lesson accrual'i yo'q oylar (masalan may — konfiguratsiya faqat iyunda kuchga kirgan) `hasLessonData = false` bilan qaytadi va `deserved`/`covered`/`centerFunded` ustunlari `null` bo'ladi (ekranda «—»). Taxminiy stavkadan raqam yasalmaydi.

## Ko'rib chiqilgan muqobillar

**Har bir sahifada o'z hisobi, testlar bilan bog'lash.** Rad etildi: testlar formulalar **bir xil** ekanini emas, har biri o'zicha to'g'ri ekanini tekshiradi. Chetlashish shundan chiqqan edi.

**Yopilgan oyni boshqacha hisoblash.** Rad etildi: yopilish chegarasida raqam sakraydi, va aynan shu sakrash 15.5 mln so'mlik xatoni bergan edi.

## Oqibatlari

**Yutuq:** bitta oy uchun bitta raqam. Prognoz skripti (`scripts/forecast-full-salary-topup.ts`) bilan bir xil matematika ishlatiladi.

**Narx:** `getMonthly` katta va bir necha yordamchiga bo'lingan. U yagona manba bo'lgani uchun undagi o'zgarish barcha ekranga ta'sir qiladi — o'zgartirish qimmat.

**Endi taqiqlangan:** ustoz oyligini `getMonthly` dan tashqarida hisoblash. Yangi ekran kerak bo'lsa — yangi formula emas, shu manbadan yangi ko'rinish.
