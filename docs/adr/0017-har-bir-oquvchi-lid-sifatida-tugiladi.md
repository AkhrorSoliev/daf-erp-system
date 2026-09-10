# ADR-0017 — Har bir o'quvchi lid sifatida tug'iladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-10
**Bog'liq:** `server/src/students/student-origin.types.ts`, `server/src/students/student-lead-origin.service.ts`, `server/src/students/students-write.service.ts`

## Kontekst

Prodda 936 ta jonli o'quvchidan atigi 44 tasi lidga bog'langan edi. Sabab
oddiy: tizimda o'quvchi qo'shishning ikkita eshigi bor — lid doskasidan
"O'quvchiga aylantirish" (lid yozadi) va `/students` sahifasidagi "O'quvchi
qo'shish" (lid yozmasdi). Ikkinchi eshik ancha ko'p ishlatilardi.

Buning natijasi voronka statistikasini ishonib bo'lmaydigan qildi: hisobot
konversiya foizini 43/494 ≈ 9 % deb ko'rsatardi, holbuki o'sha davrda 408 ta
o'quvchi haqiqatda kelib ro'yxatdan o'tgan edi — ular shunchaki lidsiz kirgan.
"Qayerdan kelasiz?" degan savolga markazning umuman javobi yo'q edi.

## Qaror

O'quvchi yaratishning yagona kirish nuqtasi — `StudentsWriteService.create` —
endi majburiy `origin: StudentOrigin` parametrini oladi:

```ts
type StudentOrigin =
  | { kind: 'DIRECT'; sourceId: string }
  | { kind: 'LEAD'; leadId: string };
```

`DIRECT` yo'lida (`/students` eshigi) `StudentLeadOriginService.recordDirectOrigin`
lid yozuvini **o'quvchi yaratilayotgan tranzaksiya ichida** yozadi:

- shu kompaniyada, shu telefon bilan jonli lid (`deletedAt: null`,
  bosqich NEW/CONTACTED/TRIAL/LOST) topilsa — **barchasi** `CONVERTED`
  qilinadi va yangi o'quvchiga bog'lanadi, lekin o'z bo'limi va o'z manbasi
  bilan qoladi (bu odamning haqiqiy kelib chiqishi — adminning hozir
  tanlagan manbasi emas);
- topilmasa — **bo'limsiz** (`sectionId: null`) lid darhol `CONVERTED`
  bosqichida yaratiladi, o'quvchining filiali va adminning tanlagan
  manbasi bilan.

`LEAD` yo'lida (`LeadsService.convert`) lid allaqachon bor — ikkinchisi
yaratilmaydi.

`origin` **ixtiyoriy emas**: `sourceId`ni HTTP darajasida `CreateStudentDirectDto`
majburlaydi, `AddStudentDialog`dagi "Qayerdan bildi?" select manba
tanlanmasdan saqlashga yo'l qo'ymaydi.

## Ko'rib chiqilgan muqobillar

**`/students` dagi "O'quvchi qo'shish" tugmasini olib tashlash, faqat lid
doskasi orqali qo'shish.** Rad etildi: bu adminlarning kundalik ishini
ikki baravar oshirar va qayta o'qitish talab qilardi — ko'p o'quvchi
(masalan eski tanish, qarindosh orqali) darhol, ariza-suhbat bosqichisiz
keladi.

**`EventEmitter2` bilan hodisa yuborish, lid yozuvini listenerda qilish.**
Rad etildi: listener xato bersa (yoki kutilmagan holatda ishlamay qolsa),
o'quvchi baribir yaratilib, lid **jimgina** yozilmay qoladi. Bu yerdagi
talab bildirishnoma emas, kafolat — shuning uchun lid yozuvi va o'quvchi
yozuvi bitta tranzaksiyada turishi shart.

**Avtomatik lidni filialning tizim bo'limiga tashlash.** Rad etildi:
bo'limlar adminning haqiqiy shakllanayotgan guruh jadvali (masalan "A1 SPSH
15:00 Munisa"), sun'iy yozuv bilan ifloslantirilmasligi kerak. Bundan
tashqari bu lid hech qachon doskada ko'rinmaydi — u tug'ilishi bilanoq
`CONVERTED`, `getBoard` esa `CONVERTED`ni yashiradi. Bo'lim tanlashning
ma'nosi yo'q edi.

**`skipLeadOrigin?: boolean` ixtiyoriy bayrog'i.** Rad etildi: ixtiyoriy
bayroq yangi chaqiruv nuqtasida unutilishi mumkin — kompilyator jim turadi.
Majburiy union tipni esa unutib bo'lmaydi: har bir yangi `create()` chaqiruvi
"bu odam qayerdan keldi?" degan savolga TypeScript darajasida javob berishga
majbur qiladi.

## Oqibatlari

**Yutuq:** Bu nuqtadan boshlab har bir yangi o'quvchining kelib chiqish
manbasi bor — yo o'z lididan meros, yo admin tanlagan manba bilan yaratilgan.
Voronka va manba statistikasi endi haqiqiy hisoblanadi. `/leads` ro'yxati
`statusChangedAt` va `convertedStudent`ni ko'rsatadi; "Holati" filtri
"O'quvchiga aylangan" tanlanganda sana oralig'i konversiya sanasiga
(`dateField: 'statusChangedAt'`) qarab ishlaydi, yaratilish sanasiga emas.

**Narx:** Tuzatishdan oldingi 892 ta lidsiz o'quvchiga **ataylab** tegilmadi
(CEO qarori, 10.09.2026) — ularni orqaga qarab lid bilan bog'lash
tekshirib bo'lmaydigan taxminlarga tayanardi (qaysi manba? qachon kelgan?).
Natijada tuzatish sanasidan oldingi davrlar uchun konversiya foizi eskicha
noto'g'ri bo'lib qolaveradi, va eski hamda yangi davrni bitta grafikda
taqqoslab bo'lmaydi — grafik chizilganda bu chegara alohida belgilanishi
kerak.

**Endi taqiqlangan:** o'quvchi `origin`siz yaratilishi mumkin emas — buni
tip darajasida kompilyator ushlaydi.

Migratsiya kerak bo'lmadi: ishlatilgan har bir ustun (`sectionId`, `sourceId`,
`statusEnum`, `convertedStudentId`, `statusChangedAt`) allaqachon bor edi.
`Lead.convertedStudentId` ataylab `Student`ga Prisma relatsiyasiz qoldirilgan
— relatsiya tashqi kalit cheklovini va shu bilan migratsiyani talab qilardi;
buning o'rniga o'quvchi ismlari alohida so'rov bilan olinib xotirada
bog'lanadi.
