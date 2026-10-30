# 0141. Aloqa markazi: «Darsga qo'yilmayotganlar» tabi

- Holati: Qabul qilindi
- Sana: 2026-10-30
- Bog'liq: [0047](0047-davomat-oynasi-va-tolovsiz-oquvchi.md) (to'lamagan o'quvchi darsga qo'yilmaydi), [0062](0062-oylik-yozilish-sikl-emas-oy.md) (oylik hisob), [0023](0023-avtomatik-pauza-chiqarmaydi.md) (avtomatik pauza), [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md) (davomat olinmagan dars)

## Kontekst

2-darsdan keyin to'lamagan o'quvchiga davomatda «Keldi», «Kelmadi» yoki «Kechikdi» qo'yib bo'lmaydi (ADR-0047). U davomat qatori qoldirmaydi, shuning uchun aloqa markazining ikkala davomatga asoslangan ro'yxati — «Bugungi kelmaganlar» va «Ko'p dars qoldirganlar» (ketma-ket 3 ta ABSENT) — uni ko'rmaydi, avtomatik pauza ham ishlamaydi. Yozilishi ACTIVE qoladi va har oy oxirida butun oy yana hisoblanadi. Oktabr 2026 da shunday o'quvchilar oylab hech kimning ro'yxatida bo'lmadi va chiqarilganda 6.2 qoidasi (kalendar bo'yicha 40% dan keyin pul qaytmaydi) ularning o'ziga yopiq darslar pulini ham ushlab qoldi (#10918: 450 000 so'm, 1 dars).

## Qaror

1. **Yangi tab «Darsga qo'yilmayotganlar»** (`GET /outreach/blocked-from-lessons`, `outreach.view`). Belgi — davomat qatorining **yo'qligi**: guruhda ACTIVE yozilishli, balansi manfiy o'quvchi, oylik hisobining (`coveredDates` minus `frozenOutDates`) o'tib ketgan kunida ustoz guruhga davomat olgan (bekor qilingan dars qatorlari sanalmaydi), lekin o'ziga hech qanday belgi qo'yilmagan.
2. **Bitta sof qoida:** `unmarkedLessonDays` (`outreach/unmarked-lesson-days.ts`). Oyna — oxirgi 31 kun, lekin `ADMISSION_START_DAY` dan oldin emas. Yozilish faqat ACTIVE, guruh faqat ACTIVE.
3. **Tab pul yozmaydi va o'quvchi holatini o'zgartirmaydi.** Amallari mavjudlari: «Qo'ng'iroq qilish» (`LogCallDialog`, sabab `DEBT`) va «Guruhdan chiqarish» (`StudentRemoveFromGroupDialog`, ya'ni pul 6.2 va sinov darsi qoidasi bo'yicha hal bo'ladi). Qarzni kechirish yo'q (ADR-0062).
4. **Statistika:** `GET /outreach/stats` ga `blockedFromLessons` qo'shildi; tab yonida shu son ko'rinadi. Bosh sahifadagi «e'tibor» raqamiga **kirmaydi** (u hozir faqat pauza yoqasidagilarni sanaydi).
5. **Aloqa ustuni** eng muhim belgini ko'rsatadi: ochiq/buzilgan to'lov va'dasi, bo'lmasa oxirgi qo'ng'iroq natijasi.

## Oqibatlari

- To'lamagan va kelmayotgan o'quvchi birinchi marta ro'yxatda ko'rinadi; admin uni chaqiradi yoki o'z vaqtida chiqaradi, keyingi oy hisoblanmaydi.
- Ro'yxat keshlanmaydi: har so'rovda ACTIVE qarzdor yozilishlar, ikki oylik hisob, oxirgi 31 kunlik davomat o'qiladi. `getStats` ham shu hisobni ishlatadi; sekin bo'lsa keshlanadi.
- Avtomatik pauza (ADR-0023) o'zgarmadi: u hamon davomat qatoriga tayanadi, shuning uchun to'lamagan o'quvchini pauzaga o'tkazmaydi. Bu alohida qaror.
- Chiqarilgan o'quvchining 6.2 bo'yicha qolgan puli (kalendar ulushi) bu ADR'da o'zgarmadi; uni to'g'rilash alohida CEO qarori.
