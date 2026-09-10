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

- shu kompaniyada, shu telefon bilan mos lid topilsa — **barchasi**
  `CONVERTED` qilinadi va yangi o'quvchiga bog'lanadi, lekin o'z bo'limi va
  o'z manbasi bilan qoladi (bu odamning haqiqiy kelib chiqishi — adminning
  hozir tanlagan manbasi emas). Moslik to'plami ikkitadan iborat: doskadagi
  jonli lid (`deletedAt: null`, bosqich NEW/CONTACTED/TRIAL) **va** arxivdagi
  `LOST` lid. Ikkinchisi shart, chunki `LeadsService.remove` `LOST` bosqichini
  har doim `deletedAt` bilan birga yozadi — faqat `deletedAt: null`
  qidirilganda "yo'qotilgan odam qaytib kelsa eski kartochkasiga ulanadi"
  degan va'da hech qachon bajarilmasdi. Aylantirilgan `LOST` lid arxivdan
  qaytariladi (`deletedAt`, `deletedById`, `deletionBatchId`, `lostReason`
  tozalanadi) — u endi arxiv qatori emas, haqiqiy konversiya. Arxivning
  boshqa hech qanday bosqichi bu moslikka kirmaydi;
- mos lidning **filiali esa o'quvchinikiga tenglashtiriladi** (quyida —
  "Telefon mosligi kompaniya bo'ylab");
- topilmasa — **bo'limsiz** (`sectionId: null`) lid darhol `CONVERTED`
  bosqichida yaratiladi, o'quvchining filiali va adminning tanlagan
  manbasi bilan. Manba `Lead.sourceId` tashqi kalitiga tushgani uchun u
  tranzaksiyadan **oldin** (`assertSourceUsable`, `companyId` sharti bilan)
  tekshiriladi: aks holda yolg'on id tranzaksiya ichida Prisma P2003 berardi
  va repoda global Prisma xato filtri yo'q — admin o'quvchisiz 500 olardi.

`LEAD` yo'lida (`LeadsService.convert`) lid allaqachon bor — ikkinchisi
yaratilmaydi.

`origin` **ixtiyoriy emas**: `sourceId`ni HTTP darajasida `CreateStudentDirectDto`
majburlaydi, `AddStudentDialog`dagi "Qayerdan bildi?" select manba
tanlanmasdan saqlashga yo'l qo'ymaydi.

### Telefon mosligi kompaniya bo'ylab, filial bo'yicha emas

Bu **ongli murosa**. Telefon qidiruvi `companyId` bilan chegaralanadi, lekin
filial bilan **emas**: 9 xonali raqam odamni bildiradi, filialni emas. Filial
bo'yicha chegaralansa, bitta odam har bir filialda alohida lid olib yurardi —
bu hozirgi holatdan yomonroq, chunki keyin "necha kishi keldi?" degan savolga
javob dublikatlar ustida qurilardi.

Murosaning narxi: bir filialning admini boshqa filial doskasidagi lidni
aylantirib yuborishi mumkin. Uni **filial o'quvchidan meros olishi** qoplaydi —
aylantirilgan har bir mos lidning `branchId` maydoni o'quvchining filialiga
tenglashtiriladi (faqat filiali `null` bo'lganlarga emas). Qoida bitta jumlada:
**konversiya odam haqiqatda o'qiy boshlagan filialda sanaladi.** Bu ikkita
holni birdan yopadi — ochiq formadan kelgan filialsiz lid hech qaysi filialda
sanalmasdi, va Farg'ona admini Namangan lidini aylantirsa konversiya noto'g'ri
filialga yozilardi.

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
`/leads` ro'yxati
`statusChangedAt` va `convertedStudent`ni ko'rsatadi; "Holati" filtri
"O'quvchiga aylangan" tanlanganda sana oralig'i konversiya sanasiga
(`dateField: 'statusChangedAt'`) qarab ishlaydi, yaratilish sanasiga emas.

**Voronka foizi endi nimani sanaydi.** Avtomatik kelib chiqish lidi voronka
o'lchoviga **kirmaydi**: `reports-overview.service.ts` dagi har bir voronka
so'rovi `sectionId: { not: null }` sharti bilan chegaralangan, ya'ni foiz
faqat doskadan o'tgan lidlarni sanaydi. To'g'ridan kirganlar (`sectionId IS
NULL`) ataylab chiqarib tashlangan — ular ham suratga, ham maxrajga tushsa,
har bir kelib qo'shilgan odam foizni 100 % ga surardi (prodda nisbat taxminan
408 to'g'ridan / 34 voronkadan, ya'ni signal 12:1 bo'g'ilardi). Ta'sir
qiladigan joylar: `leadConversionRate`, voronka taqsimoti,
`conversionRateOverTime` va aylanishgacha o'rtacha kun.

**Manba statistikasi esa aksincha — HAR BIR lidni sanaydi**, to'g'ridan
kirganlarni ham. U voronka natijasi emas, "qaysi reklama pul keltirdi?" degan
savolga javob; to'g'ridan kelgan odamning manbasi ham xuddi shu savolning bir
qismi.

**Narx:** Tuzatishdan oldingi 892 ta lidsiz o'quvchiga **ataylab** tegilmadi
(CEO qarori, 10.09.2026) — ularni orqaga qarab lid bilan bog'lash
tekshirib bo'lmaydigan taxminlarga tayanardi (qaysi manba? qachon kelgan?).
Natijada tuzatish sanasidan oldingi davrlar uchun konversiya foizi eskicha
noto'g'ri bo'lib qolaveradi, va eski hamda yangi davrni bitta grafikda
taqqoslab bo'lmaydi — grafik chizilganda bu chegara alohida belgilanishi
kerak.

Xuddi shu sababdan **doskadagi 21 ta o'lik kartochka o'zi yopilmaydi.** Ular
allaqachon o'quvchi bo'lgan odamlarga tegishli, ya'ni ular uchun boshqa
`POST /students` hech qachon yuborilmaydi va bu qaror orqaga qarab
to'ldirmaydi. Bu yerdagi tuzatish faqat **yangilari to'planmasligini**
kafolatlaydi; mavjud 21 tasini tozalash uchun har birini qo'lda "biriktirish"
oqimidan o'tkazish kerak (lid kartochkasi → "O'quvchiga aylantirish" → mavjud
o'quvchini tanlash).

**Endi taqiqlangan:** o'quvchi `origin`siz yaratilishi mumkin emas — buni
tip darajasida kompilyator ushlaydi.

Migratsiya kerak bo'lmadi: ishlatilgan har bir ustun (`sectionId`, `sourceId`,
`statusEnum`, `convertedStudentId`, `statusChangedAt`) allaqachon bor edi.
`Lead.convertedStudentId` ataylab `Student`ga Prisma relatsiyasiz qoldirilgan
— relatsiya tashqi kalit cheklovini va shu bilan migratsiyani talab qilardi;
buning o'rniga o'quvchi ismlari alohida so'rov bilan olinib xotirada
bog'lanadi.
