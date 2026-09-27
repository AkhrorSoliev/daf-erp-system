# ADR-0043 — Shartnoma 6.2: o'quvchi oyning 40% idan ko'pi o'tgach o'zi ketsa, oy to'lovi qaytarilmaydi

**Holati:** Almashtirildi — ADR-0044
**Sana:** 2026-09-27
**Bog'liq:** yangi shartnomaning 6.2 bandi, ADR-0028, `server/src/billing/departure-policy.ts` (`policyRelease`), `server/src/billing/monthly-charge.service.ts` (`reverseChargeForDeparture`, `previewDepartureOutcomes`), `server/src/students/shared/departure-policy-access.ts`, `server/src/students/student-departure-preview.service.ts`, `server/src/common/status/status-cascade.service.ts`, sozlama `payment.noRefundAfterPercent`, `client/src/components/students/departure-money-block.tsx`

## Kontekst

Oylik to'lovga o'tilgandan beri (01.09.2026) o'quvchi guruhdan ketganda
`reverseChargeForDeparture` oyning hali o'tilmagan darslari pulini balansga
qaytaradi — oyning qancha qismi o'tgani ahamiyatsiz edi. Guruhdan chiqarish,
chetlatish, muzlatish, boshqa guruhga o'tkazish va guruh, filial yoki kurs
yopilishi hammasi shu bitta qoidadan o'tardi.

Yangi shartnomaning 6.2 bandi: o'quvchi o'z qarori bilan to'xtatsa va oy
darslarining 40% idan ko'pi o'tgan bo'lsa, oy to'lovi qaytarilmaydi. CEO
2026-09-27 da guruhdan chiqarish oynasining maketini tasdiqladi («Ha roziman»):
uchta tartib, «Kurs boshlanmasdan» varianti olib tashlandi (dars o'tmagan
bo'lsa, oddiy qoida baribir hammasini qaytaradi), 40% dan keyin ketgan
qarzdorning oylik qarzi to'liq qoladi, boshqa tartibni faqat CEO yoki filial
direktori tanlaydi.

## Qaror

1. **Uchta tartib.** `STUDENT_CANCELLED` — «O'quvchi o'zi to'xtatdi» (sukut
   bo'yicha): o'tilmagan darslar puli faqat oy darslarining chegaradan
   ko'pi o'tmagan bo'lsa qaytadi. `CENTER_INITIATIVE` — «Markaz tashabbusi»:
   o'tilmagan darslar puli qaytadi (6.2 gacha bo'lgan qoida). `QUALITY_CLAIM` —
   «Sifat bo'yicha shikoyat»: oyning butun puli qaytadi, o'tgan darslar ham.
2. **Bitta qoida.** `policyRelease` (`billing/departure-policy.ts`) — sof
   funksiya. Yozuv (`reverseChargeForDeparture`) va oynadagi hisob
   (`previewDepartureOutcomes`) aynan shu funksiyani chaqiradi, shuning uchun
   oyna yozuv bermaydigan summani ko'rsata olmaydi.
3. **Ulush.** Oyning hisoblangan darslaridan ketish kuni (shu kun ham) gacha
   o'tganlari ÷ oyning hisoblangan darslari. Muzlatishda allaqachon qaytarilgan
   darslar ikkala tomondan chiqariladi; oy o'rtasida qo'shilgan o'quvchi uchun
   maxraj — uning o'z darslari. Ulush davomat bo'yicha emas, dars kuni
   bo'yicha: kelmagan o'quvchi uchun ham dars o'tgan. «Ko'pi» qat'iy: roppa-rosa
   40% o'tgan bo'lsa, o'tilmagan darslar puli qaytadi.
4. **Chegara** — `payment.noRefundAfterPercent` (0–100, sukut 40, faqat
   kompaniya darajasida, faqat CEO o'zgartiradi).
5. **Kuchga kirishi.** Qoida Toshkent kuni bo'yicha 01.10.2026 va undan keyin
   ketganlarga qo'llanadi; oldinroq ketganlar eski qoidada.
6. **«Ushlab qolindi» faqat qaytishi mumkin bo'lgan pulga aytiladi.** Oyning
   hamma darslari o'tgan bo'lsa yoki muzlatish qolganini allaqachon qaytargan
   bo'lsa, qoida hech narsani ushlab qolmagan — tarixda ham, oynada ham shunday
   deyilmaydi.
7. **Qayerda ishlaydi.** Guruhdan chiqarish (`removeFromGroup`) va chetlatish
   (`EXPELLED`): sukut bo'yicha «O'quvchi o'zi to'xtatdi». Boshqa tartibni CEO
   yoki filial direktori tanlaydi; bu huquq tokendan emas, bazadan o'qiladi
   (ADR-0028), aks holda 403. Tartib boshqa holat bilan yuborilsa — 400.
   **Qo'llanmaydi:** muzlatish, boshqa guruhga o'tkazish, guruh, filial yoki
   kurs yopilishi va guruhni o'chirish (markaz qarori — eski qoida), o'quvchi
   kartasini arxivlash (xato yoki dublikat yozuvni o'chirish, ketish emas —
   eski qoida).
8. **Ustoz oyligiga tegilmaydi.** Hech bir tartib hisoblangan oylikni
   o'zgartirmaydi; sifat shikoyatida o'quvchiga qaytgan pulning ustozga
   tegishli qismini markaz qoplaydi.
9. **Ko'rinadiganligi.** O'quvchi va guruh tarixiga «Pul» qatori yoziladi
   (masalan «Shartnoma 6.2: oy darslarining 46% o'tgan (6/13) — oy to'lovi
   qaytarilmadi»); qaytarish `ADJUSTMENT` metadata'sida `policy` va
   `heldPercent`; oynalar `GET /students/:id/departure-preview` ni ko'rsatadi.
10. Sxemaga o'zgarish yo'q: tartib alohida ustunda saqlanmaydi, ledger va
    tarix yetarli.

**Taqiqlanadi:**
- ketishda qaytadigan pulni `policyRelease` dan boshqa joyda hisoblash;
- tartibni tokendagi rol bo'yicha qabul qilish;
- 6.2 ni markaz yopgan holatlarga yoki arxivlashga qo'llash.

## Ko'rib chiqilgan muqobillar

- **To'rtinchi variant «Kurs boshlanmasdan».** CEO olib tashladi: dars
  o'tmagan bo'lsa, «O'quvchi o'zi to'xtatdi» ham oyni to'liq qaytaradi.
- **Ulushni davomat bo'yicha hisoblash.** Shartnoma o'tgan darslar haqida
  gapiradi; sababsiz kelmagan o'quvchi uchun ham dars o'tgan, ulush esa
  qaysi darsga kelgani bilan o'zgarmasligi kerak.
- **Arxivlashda ham 6.2.** Holat oynasi arxivlashni «faqat xato/duplikat
  yozuv uchun» deb yozadi; xato kiritilgan yozuvning pulini ushlab qolish
  noto'g'ri. Haqiqiy ketish — chetlatish yoki guruhdan chiqarish.
- **Tartibni alohida ustunda saqlash.** Migratsiya talab qiladi va hech kim
  o'qimaydi; tarix va ledger metadata'si savolga javob beradi.

## Oqibatlari

**Yutuq:** shartnoma bandi tizimda ishlaydi va administrator qo'lda
hisoblamaydi; oyna tasdiqlashdan oldin nima bo'lishini summasi bilan
ko'rsatadi; keyinroq «nega pul qaytmadi?» degan savolga tarixdagi «Pul»
qatori javob beradi.

**Narx:**
- Yozuvdan keyin tartibni o'zgartirib bo'lmaydi. Xato tanlangan bo'lsa, CEO
  farqni qo'lda `ADJUSTMENT` bilan tuzatadi.
- 40% dan keyin ketgan qarzdorning oylik qarzi to'liq qoladi va qarzdorlik
  sahifasida ko'rinadi.
- Balansga qaytgan pul o'z-o'zidan naqd berilmaydi — «Pul qaytarish» alohida
  amal.
- 01.10.2026 dan oldin ketganlar uchun oyna qoidani «hali kuchga kirmagan» deb
  ko'rsatadi.
