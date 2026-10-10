# ADR-0075 — Shartnoma hujjati alohida jadvalda, tuzilganda muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** spec `docs/superpowers/specs/2026-10-10-shartnoma-hujjati-design.md`, spec `docs/superpowers/specs/2026-09-24-shartnoma-tolov-qoidalari-design.md` (2-bo'lim), `server/src/contract-documents/`, `server/src/common/finance/per-lesson-price.ts`

## Kontekst

24.09 da kelishilgan: shartnoma — shablon, o'zgarmas matn va tizim to'ldiradigan
maydonlar; o'quvchi profilidan chop etiladi; imzolangan kundagi qiymatlar
o'quvchiga muhrlanadi. 02.10 da yakuniy matn tayyor bo'ldi.

Bazada eski `Contract` jadvali bor. Prod'da unda 0 ta yozuv (10.10), lekin uni pul
kodi o'qiydi: bir dars narxi avval ACTIVE `Contract` summasidan olinadi
(`per-lesson-price.ts`), dars yechimi `group.contracts[0]?.id` ni yozadi, to'lov
`Contract.paidAmount` ni oshiradi, qaytarish uning holatini o'zgartiradi. Unga
shartnoma hujjatini yozsak, to'lov va dars hisobi unga bog'lana boshlaydi.

O'quvchi bir vaqtda faqat bitta faol kursda (`unique_active_enrollment_per_student`).
Admin esa har kursga alohida shartnoma yoki bir nechta kursni bitta shartnomada
tuzishni tanlashi kerak (10.10).

## Qaror

1. Shartnoma hujjati yangi `ContractDocument` jadvalida. Eski `Contract` ga yozilmaydi.
2. PDF'ga tushadigan hamma qiymat `fields` (JSON) ga shartnoma tuzilganda yoziladi:
   filial, o'quvchi, Buyurtmachi, kurslar (narx, chegirma, guruh, ustoz, jadval).
   Filial, o'quvchi va kurs qismi keyin o'zgarmaydi. Buyurtmachi va kursning qo'shimcha
   maydonlari (dastlabki to'lov, sana, chegirma sababi va muddati, kursga kiradigan
   narsalar) imzogacha tahrirlanadi, keyin qulflanadi.
3. Matn kodda versiyalanadi (`templateVersion`). 1-versiya — 02.10 yakuniy matn,
   `docs/tolov-savollari/shartnoma-2026-yakuniy.txt` bilan test solishtiradi. Yurist
   tuzatsa, 2-versiya qo'shiladi; eski shartnomalar o'z versiyasida chiqadi.
4. Kurs bog'lanishi `Enrollment.contractDocumentId`: bitta yozilish — ko'pi bilan
   bitta amaldagi shartnoma, bitta shartnoma — bir nechta yozilish. Guruh almashganda
   bog'lanish yangi yozilishga o'tadi. Shartnoma bekor qilinganda bog'lanish uziladi.
   Kurs bekor bo'lsa (o'quvchi chiqsa), shartnoma faqat shu kurs bo'yicha bekor —
   holat yozilishning o'zidan o'qiladi.
5. Raqam `DAF-YYYY-NNNNN`: yil — shartnoma kunining Toshkent yili, kompaniya ichida
   unikal.
6. Imzo hozircha faqat qog'ozda (`signMethod = PAPER`). Bekor qilish: imzolanmagan —
   CEO, filial direktori, administrator; imzolangan — faqat CEO, roli bazadan
   o'qiladi (ADR-0028). Sabab majburiy.
7. Filialda shahar, manzil, vakil ismi va lavozimi bo'lmasa, shartnoma tuzilmaydi:
   ular muhrlanadi, bo'sh holda tuzilgan shartnoma bo'sh qoladi.

## Oqibatlar

**Yutildi:** pul kodi yangi jadvalni bilmaydi, shartnoma to'lov hisobiga ta'sir
qilmaydi. Chop etilgan va saqlangan matn bir xil — PDF har safar `fields` dan yasaladi,
fayl saqlanmaydi.

**Yo'qotildi:** narx yoki jadval o'zgarsa, eski shartnoma eski qiymatda qoladi —
qo'shimcha kelishuvsiz (3-bosqich) yangilanmaydi. Matnni o'zgartirish uchun dasturchi
kerak (yangi versiya fayli).

**Keyinga:** botda «Roziman» (`signMethod = BOT`), qo'shimcha kelishuvlar,
«tasdiqlamagan o'quvchi 2-darsga kirmaydi» qoidasi, matndagi raqamlarni To'lov
sozlamalaridan olish, 12 talik kurslar shartnomasi.
