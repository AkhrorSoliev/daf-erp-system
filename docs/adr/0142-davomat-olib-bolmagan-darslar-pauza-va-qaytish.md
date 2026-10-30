# 0142. To'lov yo'qligi uchun davomat olib bo'lmagan darslar: profilda belgi, yumshoq xabarlar, 3 darsdan keyin pauza, qaytishda kunlarni belgilash

- Holati: Qabul qilindi
- Sana: 2026-10-30
- Bog'liq: [0047](0047-davomat-oynasi-va-tolovsiz-oquvchi.md) (darsga qo'yish), [0064](0064-darsga-kirish-uchun-oy-tolovining-eng-kam-qismi.md) (50%), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), [0023](0023-avtomatik-pauza-chiqarmaydi.md) (avto-pauza), [0141](0141-aloqa-markazi-darsga-qoyilmayotganlar-tabi.md) (Aloqa markazi tabi), [0043](0043-shartnoma-6-2-40-foizdan-keyin-pul-qaytmaydi.md) (6.2), shartnoma 3.2, 3.5, 6.2, 6.3. Spec: `docs/superpowers/specs/2026-10-30-darsga-qoyilmaganlar-avto-pauza-design.md`.

## Kontekst

2-darsdan keyin to'lamagan o'quvchiga davomatda belgi qo'yib bo'lmaydi (ADR-0047), shuning uchun u davomat qatori qoldirmaydi. Natija: profilidagi «Darslar» tabida bu kunlar bo'sh; avto-pauza (ADR-0023) faqat «Kelmadi» belgisini sanagani uchun uni ko'rmaydi; xabarlar ham «Kelmadi» belgisiga bog'liq; oylik hisob butun oyni yozib turadi. O'quvchi chiqarilganda 6.2 qoidasi (kalendar bo'yicha 40% dan keyin pul qaytmaydi) o'ziga yopiq darslar pulini ham ushlab qoladi (#10918: 450 000 so'm, 1 dars).

Shartnomaning eng so'nggi matni (3.2) bu darslar uchun qarzni bekor qilmasligini, 6.3 esa 14 kalendar kun qaytmasa shartnoma xizmat to'xtagan kundan bekor bo'lishini yozadi. CEO qarori (30.10.2026): shartnoma matni o'zgarmaydi, markaz o'z huquqidan ixtiyoriy voz kechadi.

## Qaror

1. **Belgi.** Kun «davomat olib bo'lmagan» hisoblanadi, agar: oylik hisobda bor, ustoz guruhga davomat olgan (bekor qilinmagan), o'quvchida qator yo'q va o'sha kun `LessonAdmissionService` hukmi `NOT_PAID` yoki `BELOW_MIN_SHARE` edi. Sof qism `barredLessonDays`, hukm `forLessons` (bir oyga bitta o'qish); balans emas, hukm ishlatiladi.
2. **Profil.** «Darslar» tabida binafsha nuqta («To'lov yo'q»); pauzada hisobdan chiqarilgan kun halqali. «N/M keldi» ga kirmaydi. Shartnoma bandi doim havola (`ContractClauseLink`, matn `contract-template-v1.ts` dan).
3. **Ketma-ketlik.** `AbsenceStreakService` (yagona ta'rif) «Kelmadi» va davomat olib bo'lmagan kunlarni bitta kunlar chizig'ida sanaydi; faqat 1, 2-dars xabari yoki avto-pauza katagi yoqilgan bo'lsa.
4. **Xabarlar.** Uch bosqich, yumshoq ohangda, sabab aytiladi, **summa va band raqami aytilmaydi**. Har bosqich o'z katagi bilan; `logOnly` da matn faqat logga yoziladi va «yuborildi» belgisi qo'yilmaydi.
5. **Pauza va pul.** Ketma-ket 3 darsdan keyin (07:30) o'quvchi `FROZEN` (Aloqa markazi → Pauzadagilar, sabab prefiksi o'zgarmagan) va davomat olib bo'lmagan kunlar puli hisobdan chiqariladi (`BarredLessonsChargeService.release`, musbat ADJUSTMENT, `metadata.policy = 'BARRED_LESSONS'` va kunlar ro'yxati). Kelgan darslar puli qoladi. Bu yo'lda 6.2 va sinov darsi (3.5) qo'llanmaydi: markaz o'quvchini belgilay olmagan.
6. **Qaytish.** Faollashtirilganda yoki guruhga qo'shilganda profil ochilsa, admin kelgan kunlarni belgilaydi (`restore`): har kun dars narxida qarzga qaytadi, `PRESENT` qatori yoziladi va ustoz haqi mavjud `processAttendanceBilling` orqali hisoblanadi. «Hech biriga kelmagan» ham qaror, u tarixga yoziladi.
7. **Yoqish.** Yetti mustaqil katak `absence.barred.*` (faqat CEO, kompaniya darajasida): `mark`, `nudge`, `warn`, `autoPause`, `pauseNotice`, `restoreDialog`, `logOnly`. Talablar: `mark` ga 1, 2-dars xabari, avto-pauza va qaytish oynasi tayanadi; `pauseNotice` `autoPause` ga. Boshlang'ich: `mark` va `logOnly` yoqilgan. Umumiy «Avtomatik pauza» sozlamasi ham yoqilgan bo'lishi kerak (hozir prodda o'chiq).

## Ko'rib chiqilgan muqobillar

- **Shartnomaga moslash (14 kun kutish).** CEO rad etdi: shartnoma o'zgarmaydi, lekin markaz pulni ushlab turmaydi.
- **Qaytishda hamma kun avtomatik to'lanadi.** Rad etildi: admin faqat o'quvchi kelgan kunlarni belgilaydi.

## Oqibatlari

- Davomat qatori bo'lmagan kunlar endi ko'rinadi, xabar oladi va 3-darsda hal bo'ladi; chiqarishdan oldin qarz odilona.
- Markaz shartnoma 3.2 dagi huquqidan voz kechadi; admin ekranida bu har joyda band havolasi yonida aytiladi.
- `forEnrollments` har so'rovda qarzdor faol yozilishlarni o'qiydi (taxminan 60 ta, 31 kunlik oyna); tez-tez chaqiriladigan joyda keshlanadi.
- Ustoz haqi: davomat olib bo'lmagan kun uchun yozilmaydi; faqat qaytishda belgilangan kun uchun yoziladi.
- Bo'shatish natijasi 0 so'm bo'lgan kun (100% chegirma) hisob yozuvisiz qoladi va qaytish oynasida ko'rinmaydi (kodda `ponytail` izohi).
- Pauza va bo'shatish bitta tranzaksiyada emas: pauza avval, bo'shatish keyin; bo'shatish yiqilsa CEO ogohlantiriladi, qayta urinish xavfsiz (takror yozmaydi).
