# ADR-0060 — Sinov darsi javobsiz «Dars bo'ldimi?» bilan hal qilinmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-01
**Bog'liq:** ADR-0048 (3-band, sinov darsi), ADR-0054 («Dars bo'ldimi?»), `server/src/billing/monthly-charge.service.ts` (`trialLessonVerdict`, `assertTrialLessonAnswered`), `server/src/billing/departure-policy.ts` (`trialAwaitsAnswerText`), `server/src/students/student-enrollment.service.ts` (`removeFromGroup`), `server/src/students/students-status.service.ts` (`changeStatus`), `client/src/components/students/departure-money.ts`

## Kontekst

Sinov darsi (shartnoma 3.5, ADR-0048 3-band) o'quvchi barcha guruhlarda
ko'pi bilan 1 ta darsga kelganini «Keldi» va «Kechikdi» qatorlari bo'yicha
sanaydi. ADR-0054 dan beri davomat olinmagan dars «Dars bo'ldimi?» savoli
bilan javob kutadi va javob berilguncha unda davomat qatori yo'q. Shu orada
o'quvchi guruhdan chiqarilsa yoki chetlatilsa, tizim javobsiz darsni
sanamasdi: ikki darsga kelgan o'quvchi sinov darsi bo'yicha oyning butun
pulini olardi, ustoz haqi esa olib tashlanardi.

## Qaror

1. O'quvchi guruhda bo'lgan kundagi javobsiz (PENDING) «Dars bo'ldimi?»
   darsi natijani o'zgartira olsa — «Keldi»/«Kechikdi» darslari 1 tadan
   oshmaydi, javobsizlar bilan esa oshadi — sinov darsi hal qilinmaydi.
   Guruhdan chiqarish va chetlatish 400 bilan to'xtaydi: «Avval «Dars
   bo'ldimi?» savoliga javob bering: 05.10 (#014). Sinov darsi o'quvchi shu
   darsda bo'lgan-bo'lmaganiga qarab hal bo'ladi.» Admin «Bo'ldi»da
   o'quvchini «Keldi» yoki «Kelmadi» qiladi (yoki «Bo'lmadi» deb javob
   beradi), keyin chiqaradi.
2. Faqat oylik hisobni yopadigan ketish tekshiriladi: chiqarishda o'sha
   yozilish, chetlatishda o'quvchining ochiq yozilishlari — shu oyning
   CHARGED hisobi bo'lsa. Paket kurs yoki hisobsiz oy to'xtamaydi.
3. Javob natijani o'zgartira olmasa (o'quvchi hali birorta darsga kelmagan
   va javobsiz dars bitta), sinov darsi odatdagidek qo'llanadi. 1 tadan ko'p
   darsga kelgan o'quvchida savollar o'qilmaydi.
4. O'chirilgan guruhning savollari abadiy javobsiz qoladi — ular sanalmaydi.
   O'quvchining o'sha darsda o'z davomat qatori bo'lsa ham dars kutilmaydi:
   ADR-0054 dagi QR poygasi bir darsda ham qator, ham savol qoldirishi
   mumkin, bunday savolga «Bo'ldi» javob bera olmaydi; qatorning o'zi
   sanaladi.
5. Chiqarish va chetlatish oynasi shu matnni pul bloki o'rnida oldindan
   ko'rsatadi.
6. Tekshiruv hech narsa yozilmasdan oldin, lekin kirish huquqi
   tekshirilgandan keyin bo'ladi (boshqa filial admini savol sanasini
   ko'rmasligi uchun). Chetlatishda u o'quvchi holati o'zgarishidan OLDIN
   bo'ladi: chetlatish oy hisobini har bir yozilish uchun alohida yopadi, u
   yerdagi rad etish esa faqat jurnalga yoziladi. Tekshiruvdan keyin ochilgan
   savol (savollar har :00 va :30 da ochiladi) ketishni to'xtatmaydi — unda
   sinov darsi emas, oddiy qoida (shartnoma 6.2) qo'llanadi.

## Ko'rib chiqilgan muqobillar

- **Javobsiz dars «keldi» deb sanalsin.** Kodda oddiy, lekin o'sha darsga
  kelmagan o'quvchi sinov darsi pulidan mahrum bo'lardi — ketayotgan o'quvchi
  esa ko'pincha keyingi darsga kelmaydi.
- **Hozirgidek: javobsiz dars sanalmasin.** Ikki darsga kelgan o'quvchi
  oyning butun pulini olardi, ustoz haqi olib tashlanardi.

CEO 01.10.2026 da «Avval javob berilsin»ni tanladi.

## Oqibatlari

- Sinov darsi har doim haqiqiy davomat bo'yicha hal qilinadi.
- Admin javobsiz savolga javob bermaguncha bunday o'quvchini chiqara
  olmaydi. ADR-0054 dagi javob berib bo'lmaydigan savol ham chiqarishni
  to'xtatadi; matn qaysi kun va qaysi guruh ekanini aytadi.
- 1 tagacha darsga kelgan o'quvchi uchungina qo'shimcha so'rov ketadi:
  javobsiz savollar va o'sha kunlardagi guruh ro'yxati.
