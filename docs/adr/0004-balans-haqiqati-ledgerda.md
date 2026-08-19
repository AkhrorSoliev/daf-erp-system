# ADR-0004 — Balans haqiqati ledger'da saqlangan, qayta hisoblanmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-08-06
**Bog'liq:** `server/src/common/finance/ledger-replay.ts`, PR #406

## Kontekst

«Bu pul qayerga ketdi?» kartasi har to'lovni FIFO navbatga qo'yib, **keyingi** dars yechimlarini o'shandan to'ldirardi. Navbat bo'sh bo'lganda (o'quvchi qarzga dars o'tganda) yechim jimgina tushib qolardi, keyingi to'lov uni retroaktiv qoplamas edi — ya'ni allaqachon sarflangan pul «balansda qoldi» deb ko'rsatilardi.

PROD o'lchovi: **569 o'quvchidan 540 tasida** karta noto'g'ri raqam ko'rsatgan.

Muhimi shundaki, javob **allaqachon bazada**. Har bir `Transaction` qatori `balanceBefore` / `balanceAfter` ni lock ostida yozadi (`TransactionsWriteService.lockStudent`), va PROD auditi **39 516 qatorda bitta ham buzilish topmadi**.

## Qaror

Balans zanjiri **qayta qurilmaydi — o'qiladi**. Modul saqlangan `balanceBefore`/`balanceAfter` ga langarlanadi.

To'rtta qoida, o'zgartirilmasin:

1. **Hech qanday reversal filtri yo'q.** O'quvchining BARCHA pul-harakat qatorlari beriladi. Bekor qilingan qator va uning qarshi qatori ikkalasi ham kiradi va tabiiy ravishda nolga yig'iladi. Faqat aslini filtrlash zanjirni uzadi — PRODda 99 ta uzilish; hammasini olganda 0 ta
2. **`Math.abs` YO'Q.** Yo'nalish ishoradan olinadi: `amount > 0` kredit, `amount < 0` debet. Eski kod bekor qilingan yechimning musbat qarshi qatorini `Math.abs` bilan yangi dars talabiga aylantirib, pulni ikki marta undirardi — PRODda 124 qator, 4 572 301 so'm
3. **Tur ro'yxati yo'q.** Balansga tegadigan har qanday qator qatnashadi: `ADJUSTMENT`, `REFUND`, `INITIAL_BALANCE`, `DEBT_WRITE_OFF`, `MOCK_EXAM_FEE`, `DISCOUNT_ADJUSTMENT`, `BALANCE_WITHDRAWAL`. Ular allaqachon balansga ta'sir qilgan, demak ularni «ko'rmaslik» ta'rifan xato. Eski kod faqat `PAYMENT` + `LESSON_DEDUCTION` ni ko'rardi — 254 o'quvchi buzilgan
4. **Nomuvofiqlik bo'lsa — fail-closed.** `reconciled: false` qaytadi va chaqiruvchi taqsimotni **umuman ko'rsatmaydi**

To'rtinchi qoida alohida tushuntirishga loyiq: tuzatilayotgan nuqson aynan **«ishonchli ko'rinadigan yolg'on son»** edi. Uni yamalgan son bilan almashtirish o'sha nuqsonni qonuniylashtirish bo'lardi.

## Ko'rib chiqilgan muqobillar

**FIFO navbatini tuzatish.** Rad etildi: navbat modeli o'z-o'zidan haqiqatning ikkinchi nusxasi, va u yozilgan ledger bilan chetlashishi muqarrar. Ikkita haqiqat manbasi bo'lgani uchun nuqson chiqqan edi.

**Nomuvofiqlikda taxminiy son ko'rsatish.** Rad etildi — yuqoridagi to'rtinchi qoidaga qarang.

## Oqibatlari

**Yutuq:** karta bazadagi haqiqat bilan ta'rifan mos. Uch invariant test bilan majburlanadi:
- I-1 (qator): `Σcash − Σdebt === row.balanceBefore`
- I-2 (o'quvchi): `Σunspent − Σoutstandingdebt === Student.balance`
- I-3 (karta): `toPreviousDebt + toLessons + toOther + unspent === amount`

**Narx:** `balanceBefore`/`balanceAfter` yozilmagan eski qatorlar uchun karta ishlamaydi (fail-closed).

**Endi taqiqlangan:** bu moduldagi `Math.abs`, reversal filtri, va tur oq ro'yxati. Uchalasi ham PRODda pul xatosiga olib kelgan.
