# ADR-0108 — «Auditoriya» hisoboti: hozir o'qiyotganlar jinsi va yoshi, ma'lumot to'liqligi ochiq aytiladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0039 (o'quvchi birinchi kirishda jins va tug'ilgan sana beradi), ADR-0015 (faol o'quvchi), ADR-0002 (bo'sh filial doirasi — rad), ADR-0099 / ADR-0103 (hisobot shakli), `docs/superpowers/specs/2026-10-17-auditoriya-design.md`, `server/src/reports/audience/`, `client/src/components/reports/audience/`

## Kontekst

O'quvchi ilovasi jins va tug'ilgan sanani yig'moqda (ADR-0039), lekin markaz
o'z auditoriyasini — kim o'qiydi, qancha yoshda — hech qayerda ko'ra olmaydi.
Prodda (17.10.2026) hozir o'qiyotgan 516 o'quvchidan jinsi 197 tasida (38%),
tug'ilgan sanasi 195 tasida bor; tug'ilgan sana 233 tadan 224 tasi oktabrda
yozilgan, ya'ni to'ldirish endi boshlandi. Lidlarda jins umuman yo'q.
`address` va `placeOfStudy` hammada bo'sh.

## Qaror

1. **Hozir bor ma'lumotdan quriladi.** Yangi jadval, migratsiya, maydon yo'q.
   Hisobot `Student.gender` va `Student.dateOfBirth` ni o'qiydi.
2. **Kim sanaladi:** hozir o'qiyotganlar — `activeStudentWhere()` (ADR-0015),
   sarlavhadagi filial doirasida (`studentBranchWhere`). Ketgan, muzlatilgan
   va guruhsiz o'quvchi kirmaydi.
3. **Noma'lum alohida son, foizga kirmaydi.** Jins va yosh foizi faqat
   ma'lumot kiritganlar ichidan hisoblanadi; «Noma'lum» alohida chiqadi.
   Sahifa tepasida «ma'lumot qanchalik to'liq» bloki turadi: aks holda 38%
   tanlama butun markazning rasmi bo'lib ko'rinardi.
4. **Kichik tanlama foiz bermaydi.** Qatorda jinsi (yoki yoshi) aniq o'quvchi
   `MIN_KNOWN = 5` dan kam bo'lsa, foiz va o'rtacha yosh `null` — mijoz «—»
   yoki «yetarli ma'lumot yo'q» yozadi (ADR-0098 dagi «5 dan kam» qoidasi).
5. **Yosh tug'ilgan sanadan, Toshkent kuni bilan.** Saqlangan sana mahalliy
   yoki UTC yarim tun bo'lishi mumkin; `tashkentDateStr` o'sha kunni beradi,
   to'liq yil `ageOn` (`students/shared/student-onboarding.ts`) bilan
   hisoblanadi — ikkinchi nusxa yozilmaydi. Yosh guruhlarining chegaralari
   bitta joyda: `AGE_BANDS` (`audience-math.ts`).
6. **Hisob bitta joyda.** Yuklovchi (`AudienceFactsLoader`) bir so'rovda
   o'quvchilarni o'qiydi, `audience-math.ts` sof funksiyalar bilan hamma
   blokni quradi; mijoz hech narsa hisoblamaydi. Parity testi: filial
   qatorlari va kurs qatorlari yig'indisi sahifa jamiga, yosh guruhlari
   yig'indisi «yoshi aniq» sonlariga teng.
7. **Ruxsat:** `reports.students` (CEO, Branch Director), `@BranchScope()`
   ro'yxat sifatida; bo'sh doira 403 (nol bilan javob berilmaydi).

## Ko'rib chiqilgan muqobillar

**Hammani sanash (ketganlar bilan).** Rad etildi: «auditoriya» hozirgi
o'quvchilar haqida; ketganlar alohida hisobotda (ADR-0098).

**Noma'lumni «aralash» foizga qo'shish yoki taxmin bilan to'ldirish.** Rad
etildi: 38% to'ldirilgan tanlamani butun markaz deb ko'rsatish xato raqam
beradi. Taxmin to'ldirish yo'q.

**Excel, lidlar kesimi, manzil.** Hozircha qilinmadi (YAGNI): manzil va
o'qish joyi hammada bo'sh, lidlarda jins yo'q. Kerak bo'lsa, avval ilovaning
birinchi kirish qadamiga so'raladi.

**Kesh.** Qo'yilmadi: bir so'rovda ~bir ming qator. O'lchab sekin bo'lsa,
Redis (kompaniya + doira kaliti) qo'shiladi.

## Oqibatlari

**Yutuq:** CEO auditoriyani (jins, yosh, kurs, filial) bir sahifada ko'radi
va raqam qanchalik ishonchli ekanini ham ko'radi; ma'lumot to'lgan sari
sahifa o'z-o'zidan aniqlashadi.

**Narx:** hozir tanlama kichik va ilovaga kirganlar tomon siljigan (erkaklar
~80%). Bu xulosa emas, ogohlantirish bilan ko'rsatiladi. Eski o'quvchilar
ilovaga kirmaguncha yoki xodim kartani to'ldirmaguncha bo'sh qoladi.

**Endi taqiqlangan:** auditoriya foizini «Noma'lum» ni ichiga olib
hisoblash; yoshni sanadan boshqa joyda qayta hisoblash; mijozda foiz yoki
o'rtacha hisoblash.
