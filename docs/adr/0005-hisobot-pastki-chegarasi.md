# ADR-0005 — Hisobotlar `Company.systemStartDate` dan boshlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-06-06
**Bog'liq:** `server/src/common/finance/system-start-date.ts`, PR #252

## Kontekst

Tizim aprel 2026 o'rtasida ishga tushdi. Birinchi ikki hafta ma'lumoti — sinov kiritishlari, yarim to'ldirilgan davomat, qo'lda tuzatishlar. Bu «shovqin» hisobotlarda haqiqiy ko'rsatkich sifatida chiqardi va har bir yillik/davriy grafikni buzardi.

Ma'lumotni o'chirish variant emas edi: unda pul zanjiri (ADR-0004) uziladi.

## Qaror

`Company.systemStartDate` — kompaniya darajasidagi **hisobot pastki chegarasi**. O'rnatilgan bo'lsa, davomat statistikasi va analitika hisobotlari o'sha sanadan oldingi ma'lumotni **sanamaydi va ko'rsatmaydi**.

Chegara qo'llanishi (`floorStart`):

| Holat | Natija |
|---|---|
| Chegara yo'q | So'ralgan sana o'zgarishsiz |
| So'ralgan sana yo'q | Chegara (cheksiz so'rov chegaradan boshlanadi) |
| So'ralgan < chegara | Chegara |
| So'ralgan >= chegara | So'ralgan sana |

Ya'ni **ikkovidan kechrogi** olinadi. Chegara ma'lumotni o'chirmaydi — faqat hisobot oynasini qisqartiradi.

## Ko'rib chiqilgan muqobillar

**Aprel ma'lumotini bazadan o'chirish.** Rad etildi: balans zanjiri uziladi va `Transaction.balanceBefore` invariantlari buziladi (ADR-0004).

**Har bir hisobotda qo'lda `WHERE date >= '2026-05-01'`.** Rad etildi: sana kodga qotib qoladi va ikkinchi kompaniya (yoki ikkinchi filial) qo'shilganda noto'g'ri bo'ladi. Chegara — **ma'lumot**, konstanta emas.

## Oqibatlari

**Yutuq:** go'yoki-shovqin hisobotdan chiqdi, lekin pul tarixi butun qoldi. Chegara kompaniyaga bog'langani uchun har bir kompaniya o'z sanasini oladi.

**Narx:** har bir yangi hisobot chegarani **o'zi qo'llashi kerak** — u avtomatik emas. Chegarani unutgan hisobot aprel shovqinini ko'rsatadi.

**Endi taqiqlangan:** hisobot kodiga cutover sanasini konstanta qilib yozish.
