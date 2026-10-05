# ADR-0073 — To'lovlar hisoboti: narxi manfiy chiqqan oy kredit bo'lib FIFO'da taqsimlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-05
**Bog'liq:** ADR-0037 (5-bandni aniqlashtiradi), `server/src/statements/statement-analysis.ts` (`allocate`), `server/src/statements/present-dues.ts` (`dueLedger`), qarzdorlik oynasining «Oylar bo'yicha» bloki (`drawerMonths`, B2a)

## Kontekst

ADR-0037 ning 2-bandi bo'yicha dars yechimini bekor qiladigan ichki yozuvlar
(oylikdan ketganda qaytgan pul, aprel cutover qaytarmasi va boshqalar) shu
oyning darsiga qo'shib yuboriladi. Oyda dars bo'lmasa yoki qaytgan pul shu
oyning darslaridan ko'p bo'lsa, oy narxi manfiy chiqadi.

5-band (FIFO) esa faqat narxi musbat oydan qarz qatori yasardi
(`allocate`: `cost > 0`). Manfiy oy hech qayerga kirmasdi, 4-banddagi tenglik
esa uni hisobga oladi. Natija:

    to'lanmagan qatorlar yig'indisi = qarz + manfiy oylar miqdori

O'ylab topilgan misol: mart 400 000, aprel −100 000, may 400 000, bitta
to'lov 500 000, balans −200 000. Taqsimot «May qoldi 300 000» deydi, qarz esa
200 000.

Belgilari:

- PDF javob qutisi ostidagi satr qarzdan ko'p summani aytishi mumkin edi;
- `present-dues.ts` manfiy oy bo'lsa «Jami» qatorini umuman chiqarmasdi;
- qarzdorlik oynasi (B2a, `debt-list.service.ts`) qatorlar qarzga qo'shilmasa
  «Oylar bo'yicha» ni bo'sh qaytarib, ogohlantirish yozadi.

## Qaror

1. **Narxi manfiy oy — kredit.** U shu oyning 1-kuni sanasi bilan
   to'lovlar va boshqa kreditlar qatoriga qo'shiladi va to'lov kabi FIFO
   tartibida eng eski to'lanmagan qarzga yoziladi.
2. Shuning uchun qarz bo'lsa, to'lanmagan qatorlar yig'indisi har doim
   `−balans` ga teng. Qarz bo'lmasa, to'lanmagan qator yo'q. Kreditning
   sarflanmagan qismi boshqa kreditlar kabi «ortib qolgan» bo'ladi.
3. `Allocation.month` — bunday kreditning oyi. To'lov va boshqa kreditda u
   `null`.
4. Hisobotda bu kredit qoplagan qarz ostida va «Jami» ostida
   «50 000 — avgustda qaytarilgan dars puli» deb yoziladi (summa misol
   uchun). Sana yozilmaydi: kredit bitta yozuv emas, oyning yig'indisi.
5. Manfiy oy qatorining o'zi o'zgarmaydi: «Narxi» ustunida minus bilan turadi,
   izohida qaytarish sababi yoziladi.
6. «Jami» qatori qatorlar javob qutisidagi qarzga mos kelsa chiqadi. Manfiy oy
   uchun alohida taqiq olib tashlandi.

## Ko'rib chiqilgan muqobillar

- **Manfiy oyni qo'shni oyning narxidan ayirish.** Oy narxi ledgerdagi
  hisobdan farq qilib qoladi. Birinchi oy manfiy bo'lsa, ayiradigan oy yo'q.
- **Manfiy summani eng yangi qarzdan ayirish.** FIFO buziladi: pul eng eski
  qarzga yozilishi kerak, to'lov ham, kredit ham.
- **Kreditni qaytarish yozuvining kuni bilan sanalash.** Manfiy narx bir
  nechta yozuvdan va tizimgacha to'langan puldan yig'iladi, bitta kuni yo'q.
  Oy boshi qarz qatorlarining o'z qoidasi (`YYYY-MM-01`).
- **Manfiy oyni «Jami» narxiga qo'shish.** «Narxi» ustuni ko'z bilan
  qo'shilganda mos keladi, lekin ortiqcha pul bo'lsa «Jami» qatori qarzga
  qo'shilmay qoladi. Hozirgi usulda «Jami» kechirilgan qarz kabi o'qiladi.
- **Har o'quvchida qo'riqchi qoldirish.** Belgini yashiradi, sababni emas.

## Oqibatlari

- Javob qutisi satri, «Oylar bo'yicha» ning «Qarz» ustuni va «Jami» doim bir
  qarzni aytadi.
- «Narxi» ustunini ko'z bilan qo'shsangiz, yig'indi «Jami» narxidan manfiy oy
  miqdoricha kam chiqadi. «Jami» faqat musbat hisoblarni qo'shadi. Manfiy oy
  uning ostida kredit qatori bo'lib turadi, kechirilgan qarz kabi.
- Qarzdorlik oynasidagi `monthsAddingUpTo` qo'riqchisi (B2a) keraksiz bo'ladi.
  B2a bilan bu ish qaysi biri keyin `main` ga qo'shilsa, o'sha olib tashlaydi.
- Manfiy oyi yo'q hisobotlar o'zgarmaydi.
- Prodda faqat o'qish uchun tekshiruv (05.10.2026, 1072 hisobot): 702
  qarzdorning hammasida to'lanmagan qatorlar qarzga teng. Manfiy oy hozir
  bitta o'quvchida bor, u qarzdor emas. Unga endi «Jami» qatori chiqadi.
  Xato hozircha yashirin edi, keyingi qaytarishlar bilan chiqishi mumkin edi.
