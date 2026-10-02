# ADR-0058 — Oylik oyning asosiy raqami hisoblandi / to'landi / qoldi; bekor qilingan qaytarish va kechirish sanalmaydi; oylik qamrovi — filiallar to'plami

**Holati:** Qabul qilindi
**Sana:** 2026-10-01
**Bog'liq:** `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` (A2), `server/src/reports/month-charges.ts`, `server/src/telegram-groups/utils/month-charges-lines.util.ts`, `server/src/reports/reports-financial.service.ts` (`getPeriodOutflows`), `server/src/reports/reports-debt-history.service.ts`, `server/src/salary/shared/payroll-branch-scope.ts`, ADR-0002, ADR-0016, ADR-0052

## Kontekst

01.09.2026 dan barcha kurslar oylik to'lovda: oy boshida har yozilish uchun
`EnrollmentMonthlyCharge` (CHARGED, `chargedAmount`) yoziladi va oyning puli
balansdan bir yo'la yechiladi. Moliya yuzalari esa oyni hali dars qiymati
bilan o'lchardi:

- Oyning asosiy raqami «Oy oxiriga kutilyapti» edi — o'tilgan va qolgan
  darslar qiymati, bashorat. Oylik to'lovda oyning halol raqami — oy uchun
  yozilgan hisob.
- Yig'im foizi bashoratga («Oy rejasidan yig'ildi») yoki o'tilgan darslarga
  («Shundan yig'ildi», «Yig'im») bo'linardi. Oy boshida hisoblanib, ko'pincha
  oldindan to'lanadi, darslar esa noldan o'sadi: ikkinchisi oy boshida 100%
  dan oshardi, birinchisi hisobni emas, bashoratni o'lchardi. Ikkalasi ham
  «oy to'landimi?» degan savolga javob bermasdi.
- Telegram «💰 Moliyaviy xulosa» xom servisdan `expected: 0` o'qib, «Oy
  oxiriga kutilyapti: 0» yozardi.
- Ba'zi raqamlar doim noto'g'ri yoki doim 0 edi: «Hisoblangan darslar»
  (davrda yozilgan `LESSON_DEDUCTION` yig'indisi, o'tilgan darslar puli
  emas), takror «Tushgan tushum», «Vaqtida to'lovlar» (12 talik paket
  mantig'i), ustozlar jadvalidagi to'lov ustunlari va «Yo'qotilgan daromad»
  (ikkalasi shartnoma orqali — shartnoma yo'q).
- Bekor qilish bir xil turdagi qarshi qator yozadi: asl qatorga `reversedAt`,
  qarshi qatorga `reversedTransactionId`. Faqat `reversedAt: null` bilan
  o'qilgan joylar qarshi qatorni qoldirardi: sof foydada `Math.abs` uni pul
  qaytarishga aylantirardi, Telegram 🚩 uni bugungi qaytarish deb
  ko'rsatardi, bekor qilingan kechirish «Kechirildi»da qolardi.
- Ikki filialli direktor ikkinchi filialni tanlasa, sof foydaning oylik oyog'i
  bloklanib 0 o'qilardi (`narrowPayrollScope` faqat `mainBranch` ni bilardi),
  foyda oylik summasiga ortiq chiqardi.

Spec A2 ning 4-bandi (qarz ikki raqam) — alohida reja
(`docs/superpowers/plans/2026-10-01-a2-2-qarz-ikki-raqam.md`).

## Qaror (spec A2 — CEO, 27.09.2026; kartadagi oy nomi — 01.10.2026)

1. **Oylik oyning raqami (2026-09 dan, `MONTHLY_BILLING_START_MONTH`).**
   Yagona manba — `month-charges.ts` (`loadMonthCharges` →
   `splitMonthCharges`, `ReportsService.getMonthCharges` orqali):
   - **hisoblandi** = oyning CHARGED `chargedAmount` yig'indisi, filial
     qamrovi hisob qatorining `branchId` si bo'yicha;
   - **qoldi** — har o'quvchi uchun `min(max(0, qarz − keyingi oylar), shu
     oy)`: `qarz = max(0, −Student.balance)` bugun, «keyingi oylar» —
     o'quvchining shu oydan keyingi CHARGED hisoblari (barcha filiallarda,
     balans bitta). Pul eng eski hisobni birinchi yopadi, shuning uchun qarz
     eng yangi hisoblarda turadi — CEO qoidasi «shu oy = min(qarz, shu
     oyning hisoblari)». Bir o'quvchining shu oydagi bir necha filial
     hisoblari qoldiqni summaga qarab bo'lishadi;
   - **to'landi** = hisoblandi − qoldi; **yig'im foizi** = to'landi ÷
     hisoblandi (bir xona kasr; hech narsa hisoblanmagan bo'lsa `null`).

   Mijoz hech qaysi raqamni o'zi hisoblamaydi. 2026-09 dan oldingi oylar
   eski formulada qoladi.
2. **Yuzalar.**
   - **Moliya kartasi oy nomi bilan:** «{Oy} to'lovlari» (masalan «Oktabr
     to'lovlari»; oy — serverning `monthCharges.month` i, ya'ni davrning
     boshlang'ich oyi), qatorlar «Hisoblandi / To'landi / Qoldi».
     «Tushumlar» oynasi bitta oy uchun «To'landi» foizini va «{Oy} hisobi …
     so'm — shundan … to'landi, … qoldi» ni ko'rsatadi; «Oy rejasidan
     yig'ildi» va darslarga bo'lingan «Yig'im» bu oyda chiqmaydi.
     `GET /reports/financial-overview` `monthCharges` ni faqat CEO va filial
     direktoriga beradi.
   - **Bosh sahifa va Telegram doim joriy oyni ko'rsatadi**, shuning uchun
     «Bu oy hisoblandi» deydi (bosh sahifada «to'landi N%»).
   - **Telegram 21:00** oylik oyda «Shu oyning darslari» dan keyin «Bu oy
     hisoblandi / To'landi / Qoldi» ni yozadi va «Shundan yig'ildi», «Oy
     oxiriga kutilyapti», «Oy rejasidan yig'ildi» ni hech qachon yozmaydi —
     `getMonthCharges` xato bersa ham: unda uch qator shunchaki chiqmaydi,
     jurnalga ogohlantirish yoziladi. «💰 Moliyaviy xulosa» shu uch qatorni
     yozadi, oldingi oyda esa «Oy oxiriga kutilyapti» ni
     `getMonthlyExpectation` dan oladi. Ikkala xabar bitta matn yasovchini
     ishlatadi (`month-charges-lines.util.ts`).
   - **Excel «Xulosa» 4-bloki** oylik oyda «{OY YIL} OYLIK HISOBLARI»:
     «{Oy Yil} hisobi / shundan to'langan / to'lanmagan». Hech narsa
     hisoblanmagan bo'lsa «to'lanmagan» — «—», izoh «Bu oy uchun hali oylik
     hisob yozilmagan.»; «Yo'q — hammasi to'langan» faqat hisoblandi > 0 va
     qoldi = 0 bo'lganda. Kitob oyi — Toshkent oyi (ADR-0016), jarayon soati
     emas.
   - Oldingi oylarda karta, kunlik «oy oxiriga» grafigi, Telegram qatorlari
     va Excel 4-bloki o'zgarmaydi; grafik faqat ular uchun ochiladi.
3. **Olib tashlandi (hamma oylardan):** Moliya kartasidagi «Hisoblangan
   darslar» va takror «Tushgan tushum»; To'lov hisobotlaridagi «Vaqtida
   to'lovlar»; ustozlar jadvalidagi «Jami to'lov» va guruhlar oynasidagi
   «To'laganlar» / «Jami to'lovlar» (jadval endi qarz bo'yicha
   tartiblanadi); Ketgan o'quvchilardagi «Yo'qotilgan daromad».
4. **Bekor qilingan juft sanalmaydi.** Pul qaytarish va qarz kechirish
   «kuchda» degani `reversedAt: null AND reversedTransactionId: null` —
   bekor qilingan juftning ikkala qatori ham tashqarida qoladi:
   - **sof foyda** (`getPeriodOutflows`): `refunds = 0 − Σ` (kuchdagi REFUND
     manfiy), kechirish izohi — oddiy musbat Σ (kuchdagi DEBT_WRITE_OFF —
     kredit); `Math.abs` yo'q; sof foyda keshi `NET_PROFIT_CACHE_VERSION`
     `'v4'` dan `'v5'` ga oshirildi (ADR-0055 hali `v4` deydi). To'lov
     hisobotlaridagi qaytarish ham `0 − Σ`;
   - **Telegram 21:00 🚩** (bugungi REFUND / DEBT_WRITE_OFF / katta
     ADJUSTMENT);
   - **«Kechirildi»**: qarz tarixining oy ro'yxati, kogortaning kechirish
     summasi, kechirilganlar soni va ro'yxati. Qarz tarixi takrorida ikkala
     qator qoladi (balans ular bilan to'g'ri chiqadi). Qarshi qatorning
     oshishi «Yangi qarz» ga yoziladi — bekor qilingan to'lovdagidek. Asl
     qator esa to'lovdan farq qiladi: bekor qilingan to'lovning asli
     «To'landi» da qoladi, bekor qilingan kechirishning asli «Kechirildi»
     dan «Boshqa» (`debtOther`) ga ko'chadi. Shuning uchun yopilgan oyda
     berilgan kechirish keyin bekor qilinsa, o'sha oyning «Kechirildi» si
     (va «Boshqa» si) keyinchalik o'zgaradi; oyning oxirgi qarzi o'zgarmaydi.

   Balans yurishlari (kogorta `balanceAsOf`, `replayDebtOrigin`) va
   «Tekshiruv» hamma qatorni o'qiydi — ular `Student.balance` ga teng
   chiqishi kerak.
5. **Bosh sahifa davomat foizi** — davomat hisoboti formulasi: (Keldi +
   Kechikdi) ÷ (Keldi + Kechikdi + Kelmadi); «Sababli» maxrajga kirmaydi.
6. **Oylik filial qamrovi — filiallar to'plami.** CEO bo'lmagan xodimning
   oylik shifti — `mainBranch` ∪ `UserBranch` to'plami:
   `{ kind: 'all' } | { kind: 'branches'; branchIds; mainBranch } |
   { kind: 'none' }`. So'ralgan filial to'plam ichida bo'lsa beriladi,
   tashqarida bo'lsa bloklanadi; filial so'ralmasa — `mainBranch` (u bo'sh
   bo'lsa tartiblangan to'plamning birinchisi); bo'sh to'plam — `none`, hech
   narsa. `mainBranch` i bo'sh, lekin `UserBranch` qatori bor xodim endi
   to'plamdan oylikni ko'radi: ADR-0002 bunday xodimning bo'sh ekranini
   ataylab to'lanadigan narx degan edi — ADR-0002 ning o'sha qismi va
   `PayrollBranchScope` turi shu ADR bilan o'zgardi. Uning fail-closed
   tamoyili (`none` — hech narsa) o'zgarmaydi. Oylik **to'lash**
   (`payPayment`, `batchPay`) to'lovchining asosiy filialida qoladi;
   `mainBranch` bo'sh bo'lsa ikkalasi ham rad etadi. To'lovlar matritsasi
   (`getMatrix`) bu turni o'qimaydi: o'zining `mainBranch` filtri bu ADR
   bilan o'zgarmagan va u fail-closed emas — `mainBranch` i bo'sh yoki
   Administrator roli ham bor direktor u yerda hamma filialni ko'radi
   (alohida xavfsizlik vazifasi). Oddiy Administrator 2026-09-30 dan beri
   `GET /salary/matrix` ga kira olmaydi (faqat CEO va direktor).
7. **To'lov oynasi va kurs turi.** «Keyingi oy» summasi ACTIVE va FORMING
   guruhlardagi yozilishlarni sanaydi, PAUSED ni emas: oylik hisob PAUSED
   guruhni hisoblamaydi, FORMING esa boshlanish kuni ACTIVE bo'lib
   hisoblanadi. Kursni LESSON_PACK → MONTHLY ga o'tkazish jonli (ACTIVE yoki
   FROZEN) yozilishlarda oldindan to'langan darslar qolgan ekan rad etiladi
   («Bu kursda oldindan to'langan darslari qolgan N ta o'quvchi bor. …»):
   oylik kurs bu hisoblagichni o'qimaydi, pul qaytarish esa o'qiydi; qolgan
   darslarni hal qilish — pul harakati, rahbar qarori.

**Taqiqlanadi:**
- hisoblandi / to'landi / qoldi ni `month-charges.ts` dan boshqa joyda
  hisoblash, mijozda ham;
- oyning qarzini eski qarz bilan qo'shib «Qoldi» ga yozish;
- oylik oyda «Shundan yig'ildi», «Oy oxiriga kutilyapti», «Oy rejasidan
  yig'ildi» ni zaxira sifatida ko'rsatish;
- REFUND / DEBT_WRITE_OFF ni «kuchda» deb faqat `reversedAt: null` bilan
  o'qish yoki ularning yig'indisiga `Math.abs` qo'yish.

## Ko'rib chiqilgan muqobillar

- **Har hisob qatori bo'yicha FIFO** (`replayDebtOrigin`, ADR-0052 dagi
  `leftById`). Rad etildi: CEO ning 27.09 qoidasi — min-qoida; qatorma-qator
  takror o'quvchi ketganda qaytgan pulni eski qarzga yozadi, shuning uchun
  oy hisoblanganidan ko'proq to'lanmagan bo'lib chiqishi mumkin edi.
- **Moliya kartasida «Bu oy hisoblandi».** Rad etildi (01.10.2026): karta
  davrning boshlang'ich oyini ko'rsatadi, o'tgan oy yoki bir necha oylik
  davrda «Bu oy» noto'g'ri bo'lardi — oy nomlanadi.
- **`getMonthCharges` xato bersa eski qatorlarga qaytish.** Rad etildi: ular
  oylik to'lovda noto'g'ri raqamlar; qatorsiz blok to'g'ri, eski qatorli blok
  — yo'q.
- **To'lashni ham to'plamga kengaytirish.** Hozircha yo'q: hisobot tuzatishi
  pul vakolatini kengaytirmasin. `payPayment` va `batchPay` birga, alohida
  qaror bilan o'zgaradi.
- **«Keyingi oy» da faqat ACTIVE guruh.** Rad etildi: birinchi to'lov aynan
  FORMING guruhdagi yangi o'quvchidan olinadi.

## Oqibatlari

**Yutuq:** oyning raqami haqiqiy hisobdan va hamma yuzada bir xil; yig'im
foizi 100% dan oshmaydi; bekor qilingan pul hech qayerda pul bo'lib
sanalmaydi; ikki filialli direktorning foydasi to'g'ri.

**Narx:**
- Min-qoida oydan tashqari debetni (mock imtihon to'lovi va boshqalar) avval
  shu oyga yozadi: bunday o'quvchida «Qoldi» shu summagacha ortiq chiqadi.
- «To'landi» balansdan chiqariladi, kassadan emas: pulsiz yopilgan hisob (qarz
  kechirish, qo'lda kredit) ham «to'landi» ga tushadi, shuning uchun u shu oy
  kassaga kirgan pulga teng bo'lishi shart emas.
- «Qarzdorlik» hali bitta raqam; ikki raqam — A2 ning 2-qismi.
- «Oy oxiriga kutilyapti» hisoblanishda davom etadi: «Foyda tarkibi»
  prognozi va kunlik snapshot uni o'qiydi.
- Bekor qilingan qaytarish, kechirish yoki tuzatish 21:00 🚩 da umuman
  ko'rinmaydi; alohida «Bekor qilindi» qatori — keyingi qaror.
- Bekor qilingan kechirish qarzni qaytaradi va u keyingi oyning «Yangi
  qarz» ida yana sanaladi (bekor qilingan to'lovdagidek).
- `mainBranch` i bo'sh, `UserBranch` li xodimlar endi oylikni ko'radi —
  deploydan oldin prodda sanaladi. Ikki filialli direktor ikkinchi filial
  oyligini ko'radi, lekin to'lay olmaydi. Filial tanlanmasa uning sof
  foydasida asosiy filial oyligi ikkala filial tushumiga qarshi turadi
  (sarlavhadagi tanlovchi doim filial yuboradi).
- To'lov hisobotlaridagi ustozlar jadvali endi bugungi holat, sana filtri
  unga ta'sir qilmaydi.
- **Deploy: avval mijoz (yoki birga), keyin server.** Eski mijoz
  `onTimePayments` / `totalPayments` ni tekshirmasdan o'qiydi — server oldin
  chiqsa `/reports/payment-reports` qulaydi.
