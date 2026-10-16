# Adminlar KPI tizimi

**Sana:** 2026-10-16
**Holati:** CEO bilan kelishildi (16.10, «Ma'qul, hujjatni yozib 1-bosqichdan boshla»)
**Bog'liq:** ADR-0007 (lavozim ≠ rol), ADR-0054 («Dars bo'ldimi?»),
ADR-0079 / ADR-0087 (ruxsatlar), spec `2026-10-07-topshiriqlar-design.md`.

Bu hujjat butun KPI tizimining rejasi. Ish 4 bosqichda, har bosqich alohida
PR bilan chiqadi. Hozir faqat **1-bosqich** (§6) batafsil yozilgan; qolganlari
o'z navbati kelganda shu hujjatga qo'shiladi.

## 1. Muammo

- Adminlar faqat qat'iy oylik oladi (`FIXED_MONTHLY`). Tizimda xodim oyligiga
  natija uchun summa qo'shadigan hech narsa yo'q, admin bo'yicha hisobot ham
  yo'q.
- Lid bilan bir vaqtda bir necha admin ishlaydi. Har biriga KPI yozilsa, bitta
  natija uchun 2–3 marta pul chiqadi.
- Lidning «egasi» yo'q: `Lead.calledById` faqat birinchi qo'ng'iroq qilganni,
  `Lead.statusChangedById` aylantirganni saqlaydi, bot orqali aylanishda esa
  hech kimni.

## 2. Prod raqamlari (16.09–15.10.2026, faqat o'qildi)

| Ko'rsatkich | Qiymat |
| --- | --- |
| Kelgan lid | 535 |
| 2–3 admin ishlagan lid | 174 (33%) |
| O'quvchiga aylangan lid | 265, shundan 183 tasida (69%) admin yozilmagan |
| Bir o'quvchiga bir kunda 2 admin qo'ng'iroq qilgan holat | 831 dan 4 ta |
| Kelmagan, qo'ng'iroqqa javob bermagan, 7 kunda qaytgan | 66% |
| Kelmagan, «keladi» degan, 7 kunda qaytgan | 78% |
| To'lov va'dasi / bajarilgan / buzilgan | 150 / 34 / 68 |
| Bajarilgan va'dada to'lovni boshqa admin kiritgan | 34 dan 10 |

Xulosalar:

- Ikki marta to'lash xavfi **lidda** bor, qo'ng'iroqlarda deyarli yo'q.
- Kelmagan o'quvchining qaytishi asosan qo'ng'iroqqa bog'liq emas. «Qaytdi —
  pul» qoidasi o'zi bo'ladigan narsaga pul to'laydi.
- Va'da KPI'si to'lovni kiritganga emas, va'dani olganga borishi kerak.

## 3. Qarorlar (CEO, 16.10 — qayta so'ralmaydi)

1. **Natijaga to'lanadi, harakatga emas.** Qo'ng'iroq yoki izoh soni KPI
   emas — ularni tekshirib bo'lmaydi.
2. **Har natijaning bitta egasi.** Bitta natija uchun bir marta to'lanadi.
3. **Lidni xodim o'zi band qiladi.** Band qilingan lidni boshqa xodim
   ololmaydi.
4. **CEO va filial direktori** bo'sh yoki band lidni boshqa xodimga bera
   oladi. Direktor — faqat o'z filiali ichida.
5. **Bosib olishga qarshi chegara + muddat:** harakat qilinmagan band lidlar
   bir vaqtda 10 tadan oshmaydi; birinchi harakat 2 ish soati ichida, keyin
   kamida har 3 ish kunida; muddat o'tsa lid umumiy ro'yxatga qaytadi.
   Raqamlar Sozlamalarda o'zgaradi.
6. **Lid KPI'si faqat to'lovda:** lid egasiga, o'quvchining birinchi
   to'lovida, bir marta. To'lov bekor qilinsa — KPI ham bekor.
7. **Qat'iy oylik chegarasi yo'q.** Yaxshi ishlagan xodim qancha natija qilsa,
   shuncha oladi. Himoya — natija haqiqiy pul ekani va har oy CEO tasdig'i.
8. **Har bir harakat tarixga yoziladi:** band qilish, berish, qaytish,
   bo'shatish.
9. Ish bosqichma-bosqich qilinadi, hammasi birdan emas.

## 4. KPI ro'yxati

**Pul beriladigan natijalar**

| # | Natija | Kimga | Qachon |
| --- | --- | --- | --- |
| 1 | Lid to'lov qildi | Lid egasiga | Birinchi to'lovda, bir marta |
| 2 | To'lov va'dasi bajarildi | Va'dani yozganga (`createdById`) | Qarz va'da sanasigacha yopilganda (`KEPT`), har va'daga bir marta |

**Shartlar** (pul emas — KPI to'liq olinishini belgilaydi, ta'siri
4-bosqichda hal qilinadi)

3. Kunning kelmaganlariga o'sha kuni qo'ng'iroq — 90% va undan ko'p.
4. «Dars bo'ldimi?» savoliga muddatida javob.
5. Topshiriqlar muddatida bajarilgan.
6. Muddati o'tib qaytgan lidlar soni.

**KPI emas:** to'lov kiritish (kassa ishi; onlayn to'lov adminni jazolaydi),
davomat belgilash, qo'ng'iroq va izoh soni.

## 5. Bosqichlar

| Bosqich | Nima | Pul |
| --- | --- | --- |
| 1 | Lid egasi: band qilish, berish, chegara, muddat, qaytish, tarix | Yo'q |
| 2 | KPI narxlari (Sozlamalar), natija yozuvlari, «Xodimlar KPI» sahifasi; 1 oy kuzatiladi | Yo'q |
| 3 | Oylikda «KPI mukofoti» qatori, CEO tasdig'i, foyda hisobotida xarajat; ADR | Ha |
| 4 | Shartlar (3–6) va ularning KPI'ga ta'siri | Ha |

Har bosqich oldidan hal qilinadigan savollar:

- **2-bosqich:** KPI kimga beriladi (administrator, kassir?); narxlar;
  qaytib kelgan eski o'quvchining lidi hisoblanadimi.
- **3-bosqich:** qaysi oydan boshlanadi.
- **4-bosqich:** bajarilmagan shart KPI'ni qanchaga kamaytiradi.

## 6. 1-bosqich — lid egasi

Pul yo'q. Natija: har lidning bitta egasi bor, egasiz lid umumiy ro'yxatda,
kim nechta lid ushlab turgani va nechtasi qaytgani ko'rinadi.

### 6.1 Ruxsatlar

Ikki yangi ruxsat («Ruxsatlar» sahifasida boshqariladi, ADR-0079):

| Kalit | Nima | Boshlang'ich | Berilishi mumkin |
| --- | --- | --- | --- |
| `leads.claim` | Lidni band qilish va o'z lidini bo'shatish | Administrator | Direktor, Administrator, Kassir |
| `leads.assign` | Bo'sh yoki band lidni boshqa xodimga berish, egasini olib tashlash | Direktor | Direktor |

CEO har doim ikkalasiga ega. Direktor faqat o'z filiali lidini va o'z
filiali xodimiga beradi. Filialsiz lid (`branchId = null`) hamma filialga
ko'rinadi — uni direktor ham bera oladi.

### 6.2 Holatlar

Har lidda egalik maydonlari (`Lead`):

- `ownerId` — hozirgi egasi (bo'sh = umumiy ro'yxatda);
- `ownedAt` — joriy egalik qachon boshlangan;
- `ownerActedAt` — joriy egalikdagi oxirgi harakat (bo'sh = hali harakat yo'q).

Egalik tarixi `LeadOwnershipLog` jadvalida (faqat qo'shiladi, o'zgarmaydi):
`leadId, kind (CLAIM | ASSIGN | RELEASE | EXPIRE), fromUserId, toUserId,
actorId (tizim uchun bo'sh), reason, branchId, companyId, createdAt`.
Hisobot va keyingi bosqichlar shu jadvaldan o'qiydi. Har yozuv lidning
«Tarix» bo'limiga ham `EntityHistory` qatori bo'lib tushadi (qaror 8).

### 6.3 Qoidalar

1. **Band qilish** (`leads.claim`): lid faol (o'chirilmagan, aylanmagan),
   egasiz va xodimning filialida yoki filialsiz bo'lishi kerak. Xodimning
   harakatsiz band lidlari (`ownerActedAt` bo'sh) chegaradan (10) kam bo'lishi
   kerak. Ikki xodim bir vaqtda bossa — birinchisi oladi, ikkinchisiga
   «Bu lidni … band qilgan» (409).
2. **Berish** (`leads.assign`): chegaraga qaramaydi. Yangi egaga soat
   noldan boshlanadi (`ownedAt = hozir`, `ownerActedAt = bo'sh`). Oluvchi
   `leads.claim` ruxsati bor faol xodim va lid filialida bo'lishi kerak.
   «Hech kimga» tanlansa — egalik olib tashlanadi (`RELEASE`).
3. **Bo'shatish:** egasi o'z lidini umumiy ro'yxatga qaytara oladi.
4. **Harakat** — faqat **egasi** qilgani hisoblanadi:
   - qo'ng'iroq belgisi (`PATCH /leads/:id/called`, `called: true`);
   - lidga izoh (`POST /comments`, `entityType = Lead`);
   - lidga topshiriq yaratish yoki uni bajarish (keyingi qo'ng'iroq sanasi).

   Kartochkani boshqa ustunga surish, ma'lumotni tahrirlash — harakat emas.
5. **Muddat** (ish vaqti: dushanba–shanba 08:00–18:00; kompaniya va lid
   filiali bayram kunlari ish vaqtiga kirmaydi):
   - harakat hali yo'q bo'lsa: `ownedAt` + 2 ish soati;
   - harakat bo'lsa: `ownerActedAt` kunidan keyingi 3-ish kunining 18:00 i.
   Muddat saqlanmaydi — har safar shu ikki maydondan hisoblanadi. Shuning
   uchun Sozlamalarda raqam o'zgarsa, hamma lidga darhol ta'sir qiladi.
6. **Qaytish:** ish vaqtida har 15 daqiqada tekshiruv. Muddati o'tgan lid
   egasiz bo'ladi, `EXPIRE` yoziladi, sobiq egasiga ilova ichida xabar boradi.
7. **Qo'lda yaratilgan lid:** yaratuvchida `leads.claim` bo'lsa, u egasi
   bo'ladi va yaratish birinchi harakat sanaladi (u odam bilan allaqachon
   gaplashgan). Anketa va bot lidlari egasiz keladi.
8. **Aylangan lid** (o'quvchi bo'ldi): egasi qotadi, muddat to'xtaydi.
   Aylangan lidni band qilib bo'lmaydi — to'lov oldidan lidni egallab olish
   shu bilan yopiladi. 2-bosqich KPI'ni aynan shu egaga yozadi.
9. **O'chirilgan (LOST) lid:** egasi qotadi, muddat to'xtaydi. Arxivdan
   tiklansa — egasiz qaytadi (`RELEASE`, sabab «Arxivdan tiklandi»).

### 6.4 Ko'rinish

- **Kartochka:** egasining bosh harflari (tooltipda ism) va muddat
  («14:30 gacha»; 1 soatdan kam qolsa to'q sariq). Egasiz kartochkada
  `leads.claim` bor xodimga «Band qilish» tugmasi.
- **Lid oynasi:** «Mas'ul» bloki — egasi, muddat, «Band qilish» /
  «Bo'shatish», `leads.assign` bor odamga «Boshqaga berish» tanlovi.
- **Filtr «Mas'ul»:** «Meniki», «Egasiz» va xodimlar ro'yxati.
- **Xodimlar qatori** (statistika ostida): har xodim — band lidlar
  (shundan harakatsiz), tanlangan davrda qaytganlari.
- **Sozlamalar → «Lidlar egaligi»** (faqat CEO): uch raqam — harakatsiz
  lidlar chegarasi (10), birinchi harakat soati (2), keyingi harakat ish
  kuni (3).

### 6.5 Bu bosqichga kirmaydi

- 24 soat qo'ng'iroq qilinmagan lid uchun avtomatik topshiriq
  (`task-auto-leads`) o'zgarmaydi — u hamma adminga boradi. Egasi bor lidda
  uni egasiga yo'naltirish keyinroq ko'riladi.
- Muddat tugashidan oldin ogohlantirish yo'q — kartochkadagi vaqt yetarli.
- Pul, KPI narxi, natija yozuvlari — 2-bosqich.

### 6.6 ADR

ADR-0092 «Lidning bitta egasi bor: xodim band qiladi, muddatda harakat
qilmasa lid qaytadi» — shu PR bilan.
