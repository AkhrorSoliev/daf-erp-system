# ADR-0014: A1 kursi o'n ikki unitga bo'linadi

**Holat:** Qabul qilingan · **Sana:** 2026-09-03

## Kontekst

Faza 2 A1 ni manbaning lug'at bo'limlaridan hosil qilingan 20 bo'limga
ajratgan edi. Bo'lim chegarasi manbaning shakliga bog'langani uchun hajmi
teng emas edi va mavzu bilan mos tushmasdi.

## Qaror

A1 **12 unitga** bo'linadi, har unit **5–6 mavzuli bo'limga**. Xarita
`server/content/daf/a1/kurs.json` da qo'lda yoziladi, validator qo'riqlaydi,
seed shundan quradi. Unitga ko'pi bilan 50 asosiy so'z.

Qiyinlik bo'lim ICHIDA ko'tariladi: har bo'limga «tanishuv» va «ishlatish»
darsi, bo'limlar orasiga o'tish sinovi, unit oxirida yakuniy sinov.

## Sabab

Manbaning bo'linishi o'quvchining ehtiyoji emas, manbaning yorlig'i edi:
bitta bo'limga 26 dars va 226 so'z tushib qolgan edi. Faqat qiyilik bo'yicha
bo'lish esa mavzuni yo'qotadi — bitta darsda «Tisch» ham «Krankenhaus» ham
chiqadi. Mavzu ichida qiyilik ko'tarilishi ikkalasini beradi.

## Oqibat

Eski 20 bo'lim **nafaqaga chiqadi, o'chirilmaydi**: ularning 1 843 so'zi,
tarjimasi va videosi yangi kurs uchun zaxira bo'lib qoladi. `DafLesson.tier`
ixtiyoriyga aylandi va `@@unique([unitId, tier])` olib tashlandi.
