# ADR-0012 — Bosh sahifa paneli raqamlarni qayta hisoblamaydi va bo'lak-bo'lak yiqiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-02
**Bog'liq:** ADR-0004 (balans ledger'da), ADR-0006 (oylik yagona manba), `server/src/dashboard/dashboard-summary.service.ts`

## Kontekst

Bosh sahifa (`/`) boshqaruv paneliga aylantirildi: u tushum, oy oxirigi prognoz,
sof foyda, qarzdorlik, o'quvchi va guruh sonlari, davomat foizi va aloqa markazi
sanagichlarini bitta ekranda ko'rsatadi. Bu raqamlarning **hammasi** tizimda
allaqachon bor — `/payments/overview`, `/payments/debt`, `/outreach`,
`/reports/*` sahifalarida.

Loyihada bu aynan qayerda og'riganining yozuvi bor. Sof foyda bir vaqtlar
**to'rt xil sirtda to'rt xil raqam** ko'rsatgan: Telegram kunlik hisoboti ustoz
oyligini umuman ayirmasdan hisoblardi, `rm:cfin` kartasi eski kassa raqamini
olardi, grafik esa uchinchisini. Buni tuzatish uchun `getMonthlyNetProfit`
yagona manba deb e'lon qilingan. Ammo «kanonik raqam yoki kassa zaxirasi»
degan tanlov `ReportsController.getFinancialOverview` ning **ichida** qolgan
edi — ya'ni undan tashqarida hech kim foydalana olmasdi.

Shu holatda bosh sahifaga raqam kerak bo'ldi. Ikki yo'l bor edi: mavjud
servislarni qayta chaqirish, yoki panel uchun tez, maxsus so'rov yozish.
Ikkinchisi beshinchi raqamni tug'dirardi.

Ikkinchi masala — ishonchlilik. Panel beshta manbadan o'qiydi. Ulardan biri
yiqilsa, butun sahifa yiqilishi kerakmi?

## Qaror

**`DashboardSummaryService` yangi hisob-kitob yozmaydi.** U faqat mavjud
servislarni chaqiradi va natijani rolga qarab kesadi.

**Taqiqlanadi:** bu servisda `prisma.*` so'rovi yozish, agregatsiya qilish yoki
raqamni qayta hisoblash. Panelga kerak bo'lgan raqam mavjud servisda bo'lmasa,
u **o'sha servisga** qo'shiladi va ikkala chaqiruvchi bir joydan o'qiydi.

**Har bir blok alohida yiqiladi.** Bo'lim xato bersa, uning qiymati `null`
bo'ladi va nomi `failed` ro'yxatiga tushadi; qolgan bloklar chiziladi. UI faqat
o'sha blok o'rniga xabar qo'yadi.

**Rol filtri keshdan KEYIN qo'llanadi**, kesh kaliti esa rol darajasini o'z
ichiga oladi — bir rolning yozuvi boshqasiga berilmaydi.

Shu qaror tufayli «kanonik foyda yoki kassa» tanlovi kontrollerdan
`ReportsService.getNetProfitWithBasis` ga ko'chirildi: qaror ikki joyda bo'lsa,
bir kuni biri o'zgarib, ikki sahifa bir oy uchun ikki xil foyda ko'rsatib
turardi.

## Ko'rib chiqilgan muqobillar

**Panel uchun maxsus, optimallashtirilgan so'rov.** Eng tez yechim bo'lardi.
Rad etildi: bu aynan to'rtta har xil sof foyda paydo bo'lgan yo'l. Tezlik
raqamlarning bir-biriga mos kelishidan qimmatroq emas.

**Klientdan beshta endpointni parallel chaqirish.** Backendga tegilmasdi.
Rad etildi: rol tekshiruvi beshta joyga tarqalardi, administrator uchun
403 larni alohida ushlash kerak bo'lardi, va kesh qo'yadigan joy qolmasdi.

**Bitta bo'lim yiqilsa butun so'rovni yiqitish.** Sodda bo'lardi. Rad etildi:
moliya hisobining ishlamay qolishi davomat va jadval ma'lumotini yashirishga
sabab emas — rahbar baribir ishlashda davom etishi kerak.

## Oqibatlari

**Yutuq:** bosh sahifadagi raqam u kelgan sahifadagi raqam bilan **har doim**
bir xil. «Bu yerda 4.7 mln, u yerda 78 mln — qaysi biri to'g'ri?» degan savol
tug'ilmaydi.

**Narx:** panel yuqoridagi servislarning sekinligini meros oladi. Ishga
tushirilganda sovuq kesh bilan 7.3 s (keshdan 0.56 s), va bu asosan
`/reports/financial-overview` hisobiga. Maxsus so'rov ancha tez bo'lardi.

Bu narxning kutilmagan foydasi ham bor: panel `/outreach/stats` ni chaqirgani
uchun undagi 10 663 ta so'rovli N+1 ko'rinib qoldi (53 ta qatorni o'qish uchun
10 663 marta bazaga borilardi) va tuzatildi. Umumiy servislarni qayta
ishlatish ularning nuqsonini ham ko'rinadigan qiladi.

**Endi taqiqlangan:** `DashboardSummaryService` ichida baza so'rovi yozish.
