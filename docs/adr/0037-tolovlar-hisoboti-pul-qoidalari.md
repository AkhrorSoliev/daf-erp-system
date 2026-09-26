# ADR-0037 — To'lovlar hisoboti: pul dars o'tilgan oyga yoziladi, ichki tuzatishlar darsga qo'shiladi, taqsimot FIFO

**Holati:** Qabul qilindi
**Sana:** 2026-09-26
**Bog'liq:** `server/src/statements/`, `docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`, ADR-0004, `server/src/common/finance/ledger-replay.ts`

## Kontekst

O'quvchi va admin «pulim qayerga ketdi?» degan savolga bitta javob kutadi.
Ledger qatorlari bunga javob bermaydi:

- 12 talik paket darsdan oldin yechiladi, ishlatilmagan darslar puli keyin
  qaytariladi;
- oylik to'lovga o'tish (26.09.2026) sentabr yechimlarini teskari qilib, oylik
  hisob yozdi;
- oylikdan ketganda o'tmagan darslar puli qaytadi.

Hisobotning birinchi maketida bu yozuvlar «Qaytarilgan 3 marta» bo'lib
chiqdi va CEO uni tushunmadi. CEO: «Sodda degani ma'lumot olib tashlanishi
emas». PDF'ning 8 ta haqiqiy misoli (v3) 26.09 da ma'qullandi.

## Qaror

1. **Dars narxi dars o'tilgan oyga yoziladi.**
   - Paket yechimi `splitLessonSlices` bilan darslarga bo'linadi. Har bo'lak
     FIFO qamrovi bergan dars kunining oyiga tushadi.
   - Oylik hisob o'z davriga tushadi. Uning darslari
     `coveredDates − frozenOutDates`.
2. **Faqat dars yechimini bekor qiladigan ichki yozuv darsga qo'shib
   yuboriladi va shu oyning izohida aytiladi.** Bunday yozuvlar:
   - paketdan qaytgan pul;
   - aprel cutover qaytarmasi;
   - `overcharge-monthly-carried-in` krediti;
   - oylikdan ketganda qaytgan pul;
   - migratsiya bekor qilgan yechim.
3. **Boshqa har qanday kirim yoki chiqim sanali alohida qator bo'ladi va
   balansni o'zgartiradi:** chegirma, qarz kechirilishi, naqd qaytarish,
   mock imtihon, balansdan olish, boshlang'ich balans, boshqa tuzatish.
4. **Tenglik so'mma-so'm:** to'lovlar + kirimlar − chiqimlar − darslar −
   oldindan to'langan darslar = `Student.balance`. Farq chiqsa, u yashirilmaydi:
   «tushuntirilmagan farq» qatori qo'shiladi va serverga xato yoziladi.
5. **Taqsimot FIFO.** To'lov va kreditlar sana tartibida eng eski to'lanmagan
   darsga yoziladi.
6. **Belgi.** Yangi qaytarish yozuvlari `metadata.kind` bilan yoziladi
   (`monthly-release`, `prepaid-release`). Eski yozuvlar izoh matnidan
   taniladi.
7. **To'lov turi har oy uchun yechimlarning o'zidan aniqlanadi,** sozlamadan
   emas. Paket bo'laklari bo'lsa paket, oylik hisob bo'lsa oylik. Tizim
   12 talikka qaytsa ham hisobot o'zgarishsiz to'g'ri gapiradi.

## Ko'rib chiqilgan muqobillar

- **Ledger qatorlarini bittama-bitta ko'rsatish (hozirgi tab).** Paket va
  oylik aralashganda tushunarsiz, oylik qatorlarini «hali o'tilmagan» deb
  ko'rsatadi.
- **Pulni to'lov oyiga yozish.** Paket oyni kesib o'tadi va bir oyning
  darslari ikki to'lovga bo'linadi, shuning uchun oylar o'zaro solishtirib
  bo'lmaydi. Oylik to'lov esa aynan oy bo'yicha, shu sabab dars oyi tanlandi.
- **Ichki tuzatishlarni alohida «qaytarilgan» qator qilish (v1).** CEO
  tushunmadi.

## Oqibatlari

- Hisobot balans bilan so'mma-so'm mos keladi yoki farqni ochiq aytadi.
- Eski yozuvlarni tanish izoh matniga bog'liq. Matn o'zgarsa, tasnif buziladi
  (`statement-months.spec.ts` himoya qiladi). Yangi yozuvlar belgi bilan
  yoziladi, shuning uchun bu bog'liqlik vaqt o'tishi bilan yo'qoladi.
- Qo'lda yozilgan, lekin aslida paketni qaytargan tuzatish belgisiz bo'lsa,
  replay o'sha darslarni keyingi oyga bog'laydi. Bunday yozuvlar bir martalik
  skript bilan belgilanadi.
