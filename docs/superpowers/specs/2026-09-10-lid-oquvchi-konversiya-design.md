# Har bir o'quvchi lid sifatida tug'iladi

**Sana:** 10.09.2026
**Holati:** dizayn tasdiqlangan, amalga oshirilmagan

## Muammo

Markazga kelgan odam odatda lid doskasiga umuman tushmaydi — admin uni to'g'ridan-to'g'ri
o'quvchi qilib qo'shib yuboradi. Natijada voronka bo'sh, konversiya foizi yolg'on, va
o'quvchi qayerdan kelgani hech qayerda yozilmaydi.

### Prod raqamlari (10.09.2026)

| Ko'rsatkich | Qiymat |
| --- | --- |
| Tirik o'quvchi | 936 |
| Shundan biror lidga bog'langani | 44 (4,7 %) |
| 01.06.2026 dan keyin qo'shilgan o'quvchi | 408 |
| Shundan lid orqali kelgani | 34 (8 %) |
| Jami lid | 494 (NEW=237, CONVERTED=43, LOST=214, CONTACTED=0, TRIAL=0) |
| Doskadagi ochiq lid | 173, shundan 21 tasi allaqachon tirik o'quvchi |
| Manbasi ko'rsatilmagan lid | 126 / 494 |

## Ildiz sabab

Tizimda o'quvchi yaratadigan ikkita mustaqil eshik bor:

1. **Lid orqali** — `LeadsService.convert` (`server/src/leads/leads.service.ts:792`)
2. **To'g'ridan-to'g'ri** — `POST /students` (`server/src/students/students.controller.ts:97`),
   `AddStudentDialog` orqali (`client/src/components/students/add-student-dialog.tsx:154`)

Ikkinchi eshik lid yozuvini umuman qoldirmaydi va amalda hukmron: 892 / 936.

`convert()` ning o'zida jiddiy nuqson yo'q — u telefon dublikatini, guruh holatini va
filialni to'g'ri tekshiradi. Muammo shundaki, unga deyarli hech kim kirmaydi.

## Aniqlangan kamchiliklar

1. **Ikkinchi eshik lid qoldirmaydi** — asosiy sabab.
2. **Mavjud lid tanilmaydi.** `students-write.service.ts:72` telefonni faqat `Student`
   jadvalidan qidiradi, `Lead` dan emas. Shuning uchun doskada 21 ta o'lik kartochka
   abadiy `NEW` bo'lib turibdi.
3. **Konversiya foizi yolg'on.** `reports-overview.service.ts:340` faqat `Lead` jadvalini
   sanaydi: 43/494 ≈ 9 %. Aslida o'sha davrda 408 ta yangi o'quvchi kelgan.
4. **Manba yo'qoladi.** `Student` modelida `sourceId` yo'q va to'g'ridan qo'shishda
   "qayerdan bildi?" umuman so'ralmaydi.
5. **Voronkaning o'rtasi bo'sh.** `CONTACTED=0`, `TRIAL=0`. `status-transitions.ts:52`
   da `TRIAL → CONVERTED` yozilgan, lekin `convert()` bu jadvalni tekshirmaydi.
6. **"Aylanganlar" ro'yxati hisobot bo'la olmaydi.** Ro'yxat bor (Lidlar → "Holati" →
   "O'quvchiga aylangan", `findAll` CONVERTED ni chetlab o'tmaydi), lekin unda qaysi
   o'quvchiga aylangani ko'rsatilmaydi va "Sana" ustuni lid yaratilgan kunni beradi,
   aylangan kunni emas.
7. **Bog'lanish bir tomonlama.** `Lead.convertedStudentId` bor, `Student` tomonda yo'q.

## Qaror

**Har bir o'quvchi lid sifatida tug'iladi.** Ikkala eshik ham qoladi, lekin ikkalasi ham
lid yozuvini qoldiradi. Majburlash adminni o'qitish bilan emas, tizim darajasida bo'ladi.

### 1. Majburiy `origin` parametri

O'quvchi yaratish funksiyasiga majburiy "kelib chiqishi" parametri qo'shiladi:

```ts
type StudentOrigin =
  | { kind: 'DIRECT'; sourceId: string }
  | { kind: 'LEAD'; leadId: string };

create(dto, companyId, userId, origin: StudentOrigin)
```

- `DIRECT` — tizim lid yozuvini o'zi yaratadi (quyida).
- `LEAD` — lid allaqachon mavjud, hech narsa yaratilmaydi.

Parametr **ixtiyoriy emas va bayroq emas**. `skipLeadOrigin?: boolean` ko'rinishidagi
bayroq unutilishi mumkin; majburiy union tipni unutib bo'lmaydi — kelajakda o'quvchi
yaratadigan uchinchi yo'l yozilsa, kompilyator uni "bu odam qayerdan keldi?" degan
savolga javob berishga majbur qiladi.

Bugun bu funksiyani chaqiradigan atigi ikkita joy bor, shuning uchun o'zgarish kichik.

### 2. `DIRECT` yo'lida nima bo'ladi

**a) Avval telefon bo'yicha mavjud lid qidiriladi**
(`deletedAt: null`, `statusEnum` ∈ {NEW, CONTACTED, TRIAL, LOST}).

Topilsa — yangi yozuv yaratilmaydi. Mavjud lid o'z bo'limida qolgan holda `CONVERTED`
ga o'tadi, `convertedStudentId` yoziladi, doskadan tushadi. Bir xil telefonli bir nechta
lid topilsa — hammasi shu o'quvchiga bog'lanadi. `Lead.convertedStudentId` ko'plikka
ruxsat beradi va `LeadsService.findByStudentId` buni allaqachon massiv sifatida
qaytaradi.

**b) Topilmasa — yangi lid yozuvi yaratiladi:**

| Maydon | Qiymat |
| --- | --- |
| `firstName`, `lastName`, `phone` | o'quvchidan |
| `branchId` | o'quvchining filiali (to'g'ridan) |
| `sectionId` | **`null`** |
| `sourceId` | admin tanlagan manba |
| `statusEnum` | `CONVERTED` |
| `convertedStudentId` | yangi o'quvchi id |
| `statusChangedAt`, `statusChangedById` | o'sha payt / admin |

**Nega bo'limsiz.** Bu lid doskada bir soniya ham turmaydi (`getBoard` CONVERTED ni
yashiradi), shuning uchun unga joy tanlashning ma'nosi yo'q — bo'lim tanlash faqat
haqiqiy guruh jadvalini ifloslantirgan bo'lardi. Baza buni allaqachon qo'llab-quvvatlaydi:
`schema.prisma:600` da `sectionId String?`, lidning o'z `branchId` maydoni bor
(`schema.prisma:646`), va `leads-list.tsx:178` bo'limsiz lidni `—` deb to'g'ri
ko'rsatadi. Prodda hozir 0 ta bo'limsiz lid bor, ya'ni hech qanday eski ma'lumot
bunga bog'liq emas.

**Tranzaksiya.** Lid yozuvi o'quvchi bilan bitta tranzaksiyada yaratiladi. Hodisa
(`EventEmitter2`) mexanizmi **ishlatilmaydi**: u repoda xabarnomalar uchun, ya'ni
yo'qolishi mumkin bo'lgan ishlar uchun ishlatiladi. Bu yerda talab — kafolat, shuning
uchun listener xato bersa o'quvchi lidsiz qolib ketishi mumkin bo'lgan yo'l mos emas.

**Modul chegarasi.** `LeadsModule` allaqachon `StudentsModule` ni import qiladi, teskari
import halqa yasaydi. Shuning uchun lid yozuvi `students` moduli ichidagi kichik alohida
xizmatda `prisma.lead` ga to'g'ridan yoziladi (doska mantig'i kerak emas — `sectionId`
`null`). Repoda `Lead` jadvaliga boshqa modullardan murojaat qilish odati bor
(`reports-overview.service.ts`, `telegram-group-daily-report.service.ts`).

### 3. Frontend o'zgarishi

`AddStudentDialog` ga bitta yangi **majburiy** maydon: **"Qayerdan bildi?"** —
`GET /lead-sources` dan to'ldiriladi (prodda hozir: Instagram, Telegram, Tanishlar).
Tanlanmasa forma yuborilmaydi.

Boshqa hech narsa o'zgarmaydi: lid doskasi, aylantirish tugmasi, o'quvchi qo'shish
oqimining qolgan qismi bordek qoladi.

### 4. "O'quvchiga aylanganlar" ro'yxati

Ro'yxat allaqachon bor, lekin hisobot bo'la olmaydi. Uchta tuzatish
(`client/src/components/leads/leads-list.tsx` va `LeadQueryDto`):

- **"O'quvchi" ustuni** — ism va profilga bosiladigan havola
  (`/students/profile/{convertedStudentId}`)
- **"Aylangan sana" ustuni** — `statusChangedAt`
- **Sana filtri** — `CONVERTED` holati tanlanganda `createdAt` emas, `statusChangedAt`
  bo'yicha filtrlaydi, shunda "shu oyda nechta odam o'quvchi bo'ldi" savoliga javob
  bo'ladi

"Joylashuvi" ustunidagi `—` belgisi "voronkadan o'tmagan, to'g'ridan qo'shilgan" degan
ma'noni beradi — buning uchun alohida maydon kerak emas.

### 5. `LOST → CONVERTED` o'tishi ochiladi

`status-transitions.ts:52` da hozir `LOST: ['NEW', 'ARCHIVED']`. Yo'qotilgan deb
belgilangan odam qaytib kelib ro'yxatdan o'tsa, bu o'tish taqiqlangani uchun uning
lidi eskicha qolib ketadi. `CONVERTED` qo'shiladi: odam qaytib keldi — bu hisobotda
ko'rinishi kerak.

## Qamrovdan tashqarida

- **Eski 892 ta lidsiz o'quvchi.** Ularga tegilmaydi (CEO qarori, 10.09.2026). Hisobot
  tuzatish sanasidan boshlab ishonchli bo'ladi; undan oldingi davrlar uchun konversiya
  foizi eskicha yolg'on bo'lib qolaveradi va buni bilib turish kerak.
- Lid doskasi, ustunlar, bo'limlar tuzilishi.
- Mavjud "O'quvchiga aylantirish" tugmasi va uning mantig'i.
- Hisobotdagi konversiya foizi formulasi — kirish ma'lumoti to'g'rilanadi, formula emas.
- `CONTACTED` / `TRIAL` bosqichlarini majburiy qilish — alohida ish.

## Kutilayotgan natija

- Tuzatish sanasidan keyin yaratilgan **har bir** o'quvchi lidlar sahifasidagi
  "O'quvchiga aylangan" ro'yxatida ko'rinadi.
- Har bir yangi o'quvchining manbasi yoziladi → "qaysi reklama pul keltirdi" savoliga
  hisobot javob bera boshlaydi.
- Doskadagi 21 ta o'lik kartochka o'zi yopiladi va yangilari to'planmaydi.
- Konversiya foizi tuzatish sanasidan keyingi davrlar uchun haqiqiy bo'ladi.

## Tekshirish

- To'g'ridan o'quvchi qo'shilganda lid yozuvi yaratiladi, `sectionId` `null`,
  `statusEnum` `CONVERTED`, `convertedStudentId` to'g'ri.
- Telefoni doskadagi lidga mos kelsa — yangi yozuv yaratilmaydi, mavjudi `CONVERTED`
  ga o'tadi va doskadan tushadi.
- Bir xil telefonli bir nechta lid bo'lsa — hammasi bog'lanadi.
- Lid orqali aylantirishda ikkinchi lid yozuvi **yaratilmaydi**.
- Manba tanlanmasa o'quvchi saqlanmaydi.
- Lid yozuvi yozilmasa o'quvchi ham yozilmaydi (tranzaksiya).
- Filial lidga to'g'ri o'tadi (filial bo'yicha ko'rinish qoidalari buzilmaydi).
