# 0122. Daraja testi natijalari: o'quvchi kartasida, umumiy statistikada, testni o'rtada to'xtatish

- Holati: Qabul qilindi
- Sana: 2026-10-24
- Bog'liq: [0121](0121-darajani-aniqlash-boti-savollar-havzasi.md)

## Kontekst

ADR-0121 testni faqat lid yig'ish uchun qurdi: natija faqat tugatganlarning lidida qolardi. Savollar: allaqachon o'qiyotgan o'quvchi testni yechsa natija qayerga tushadi; nechta odam boshladi, nechtasi tugatdi, nechtasi yarmida qoldi; savollar qiyinlashganda odam testni shu joyida to'xtatib natijasini bilishi mumkinmi.

## Qaror

1. **Urinish boshlanganda yoziladi.** `LevelTestAttempt` birinchi savolda `IN_PROGRESS` bilan ochiladi va har javobdan keyin yangilanadi (`answered`, `correctByLevel`). Holatlar: `IN_PROGRESS`, `COMPLETED`, `STOPPED` (o'zi to'xtatdi), `TIMED_OUT` (ketma-ket 3 javobsiz), `CANCELLED`. Bazada `IN_PROGRESS` bir soatdan eski bo'lsa, hisobotda «yarmida qoldi» (`ABANDONED`) deb o'qiladi — bazaga yozilmaydi, hech kim uni yopmaydi.
2. **«🏁 Natijani bilish».** Testda tugma bor; «Ha/Yo'q» tasdig'idan keyin test to'xtaydi va shu paytgacha yetilgan daraja aytiladi (`judgeStopped`: A1 tugamagan va 4 tadan kam to'g'ri bo'lsa — «aniqlanmadi»). Odam bunday natija bilan ham telefon/filial bosqichiga o'tadi.
3. **O'quvchi.** Telegram chatiga aynan bitta o'quvchi kartasi bog'langan bo'lsa (`Student.telegramChatId`), bot telefon va filial so'ramaydi, lid ochmaydi: urinish `studentId` ga bog'lanadi va o'quvchi tarixiga yozuv tushadi. Bir chatda bir nechta karta (aka-uka) bo'lsa, oddiy lid oqimi qoladi — hujjatlangan cheklov.
4. **O'quvchi profili.** `GET /students/:id/level-tests` (`students.details`, o'quvchi filiali `assertCallerMayTouchStudent` bilan): so'nggi natija va urinishlar ro'yxati (ko'pi bilan 50). «Guruhlar» yorlig'ida blok sifatida; alohida yorliq ochilmadi.
5. **Umumiy statistika.** `GET /telegram/channel-report/level-tests?month=` (`reports.students`, CEO va Branch Director): oy bo'yicha boshlaganlar, har xil odamlar, holatlar, natija taqsimoti, nechanchi savolda qolgani, o'quvchi/boshqa, telefon qoldirib lid bo'lganlar. «Bot hisoboti» sahifasida blok. Hisob sof funksiya (`level-test.stats.ts`).

## Oqibatlar

- Migratsiya `20261024150000_level_test_status_student`: enum, ustunlar, `result` null bo'lishi mumkin, eski qatorlar `COMPLETED` deb to'ldirildi.
- Yangi marshrutlar `branch-route-policy.ts` va `route-access.snapshot.json` da.
- Tashlab ketilgan urinishlar bazada qoladi (tozalash yo'q).
