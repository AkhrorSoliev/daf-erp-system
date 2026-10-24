# ADR-0121 — Botdagi «Darajani aniqlash»: savollar havzasi, natija qoidasi, lid

**Holati:** Qabul qilindi
**Sana:** 2026-10-24
**Bog'liq:** ADR-0025, ADR-0093, `docs/superpowers/specs/2026-10-24-darajani-aniqlash-design.md`, `docs/superpowers/specs/2026-10-24-darajani-aniqlash-savollar.md`, `server/src/level-test/`, `server/src/telegram/scenes/level-test.scene.ts`

## Kontekst

Bot menyusidagi «📊 Darajani aniqlash» tugmasi "tez kunda" javobini berardi. Maqsad — lid yig'ish: yangi odam botda qisqa test topshiradi, taxminiy darajasini bilib, telefonini qoldiradi va administrator unga qo'ng'iroq qiladi.

Bitta qat'iy 15 savolli test ikki joyda yaroqsiz: qayta topshirgan odamga bir xil savollar chiqadi, javoblar esa bir-biriga tez tarqaladi. `DafExercise` (o'quvchi kursining mashqlari) bu maqsadga mos emas: u "mavzuni o'rgandingmi" deb so'raydi, "qaysi darajadasan" deb emas, va A2/B1 kontenti A1 ga qaraganda ancha kam.

## Qaror

1. **Savollar havzasi — kodda, qo'lda yozilgan:** `level-test-questions.ts`, 200 ta (A1, A2, B1, B2 — har biri 50). Har savol: barqaror `id` (`a1-007`), daraja, matn, 1 to'g'ri va 3 xato variant. Manba va ko'rik hujjati — `…-savollar.md`. Xato savol shu ro'yxatdan o'chiriladi; qolganlarning `id`'si o'zgarmaydi va o'chirilgani qayta ishlatilmaydi.
2. **Har urinishda 20 ta savol, hamma darajadan:** A1, A2, B1, B2 dan 5 tadan, shu tartibda. Oldingi darajadagi natija testni to'xtatmaydi: odam har doim hamma 4 darajani ko'radi (birinchi versiyada A1 dan o'tilmasa test 5 savolda tugardi; bu noto'g'ri edi). Tanlash tasodifiy, variantlar tartibi har safar aralashadi. Shu chat avvalgi 10 urinishda ko'rgan savollar (`LevelTestAttempt.questionIds`) avval chiqmaydi; havza tugasa, ko'rilganlardan to'ldiriladi.
3. **Natija qoidasi — bitta sof funksiya `judge`:** test tugagach darajalar A1 → B2 tartibida tekshiriladi, har birida `PASS_MARK = 4` (5 dan) to'g'ri javob kerak. Natija — birinchi o'tilmagan darajadan oldingi daraja: `BEGINNER` (A1 dan o'tilmagan), `A1`, `A2`, `B1`, `B2` («B2 yoki yuqori»). Yuqoridagi darajalardagi to'g'ri javoblar o'tilmagan darajadan keyin hisobga olinmaydi: taxminan topilgan javob darajani ko'tarmasin.
4. **Har savolga vaqt beriladi, daraja bo'yicha:** A1 20 s, A2 30 s, B1 40 s, B2 50 s (`SECONDS_PER_LEVEL`), savol matnida ko'rsatiladi. Vaqt tugasa savol xato hisoblanadi ("javob hisobga olinmadi") va bot keyingisini beradi. Ketma-ket 3 ta savol javobsiz qolsa (`MAX_TIMEOUTS_IN_ROW`), odam ketgan deb test to'xtatiladi va urinish SAQLANMAYDI. Tarmoq kechikishi uchun 3 soniya muhlat (`GRACE_SECONDS`).
   - **Muddat bot xotirasida emas, sessiyada** (`deadlineAt`): savolga bosilgan tugma muddatdan keyin kelsa, sahnaning o'zi uni rad etib, vaqt tugagan deb hisoblaydi. Bu asosiy kafolat.
   - **Odam hech narsa bosmasa, keyingi savolga o'tishi uchun** `TelegramService` jarayon ichida `setTimeout` qo'yadi va muddat o'tgach botning O'ZIGA `ltt:<tartib>` yangilanishini yuboradi (`bot.handleUpdate`), shu sabab u sessiya va sahna middleware'laridan odatdagi yo'l bilan o'tadi. Telegraf bir kalitli sessiyani bir vaqtdagi yangilanishlar orasida bitta obyekt sifatida bo'lishadi, shuning uchun poyga yo'q; tartib raqami va `processing` bayrog'i ikki marta o'tishni to'sadi. Taymer qayta ishga tushirishda yo'qoladi: shunda avto-o'tish kechikadi, test buzilmaydi.
5. **Urinish test tugaganda yoziladi** (`LevelTestAttempt`): yarim tashlab ketilgani yozilmaydi. Savollar sessiyada (Redis) turadi.
6. **Lid ixtiyoriy va odamning o'z raqami bilan:** natija ko'rsatilgach bot raqam so'raydi («📱 Telefon raqamni yuborish» yoki «Keyinroq»). Faqat o'zining kontakti qabul qilinadi (`contactBelongsToSender`). Raqamni yuborgan odamdan **bot filialni so'raydi** (faol filiallar tugma bo'lib; bitta filial bo'lsa so'ralmaydi). Lid tanlangan filialning «Yangi» ustunidagi birinchi bo'limga tushadi, manbasi — «Telegram bot — daraja testi». Natija lidning tarixida (`darajaTesti`) turadi.
7. **Takroriy lid yaratilmaydi:** shu telefonli jonli lid bor bo'lsa, urinish unga bog'lanadi (`LevelTestAttempt.leadId`), yangi lid ochilmaydi.
8. **`LeadsService` chaqirilmaydi.** U `TelegramModule` dan import qilinsa halqa yasaydi; `StudentLeadOriginService` ham shu sabab `prisma.lead` ga to'g'ridan yozadi. Lid, uning `EntityHistory` yozuvi (`tx` bilan) va urinishga bog'lanish bitta tranzaksiyada.

9. **Test davomida YAGONA xabar tahrirlanadi** (`level-test.render.ts`, sof va sinalgan): tepada sarlavha va jarayon chizig'i, javob berilgan savollar ochiladigan blokda (`<blockquote expandable>`), pastda hozirgi savol, harfli variantlar (matnda) va qolgan vaqt chizig'i; tugmalar — bitta qatorda A–D. Qolgan vaqt chizig'i har `TICK_SECONDS = 5` soniyada yangilanadi (Telegram tez-tez tahrirlashni cheklaydi; botning o'ziga `ltk:` yangilanishi). Xabar o'chirilsa, savol yangi xabarda yuboriladi; matn `escapeHtml` dan o'tadi, 3800 belgidan oshsa eng eski tarix yashiriladi.

## Taqiqlanadi

- `judge` dan boshqa joyda daraja hisoblash.
- Test uchun to'g'ri javobni foydalanuvchiga ko'rsatish (javobdan keyin faqat tanlangani yoziladi).
- Havzadagi savolning `id`'sini o'zgartirish yoki qayta ishlatish.
- Lid yaratishda raqamni kontaktdan emas, matndan olish: begonaning raqami bilan lid ochilmasligi kerak.
- Muddatni faqat taymerga ishonib hal qilish: kech kelgan javob sahnada `deadlineAt` bo'yicha tekshiriladi, taymer esa faqat "odam hech narsa bosmadi" holati uchun.
- Vaqt tugagan savolga javobsiz o'tilganda "to'g'ri javob"ni ko'rsatish.

## Muqobillar

- **`DafExercise` dan savol olish** — rad etildi: yuqoridagi ikki sabab (maqsad va A2/B1 kontenti).
- **Filialni sozlamada belgilash** — rad etildi: bitta bo'lim tanlash filialga qarab ishlamaydi, sozlama esa yangi ekran talab qiladi. Bot filialni o'zi so'raydi.
- **Filialsiz, bo'limsiz lid** — rad etildi: doskada ko'rinmaydi.
- **Kuniga urinishlar chegarasi** — hozircha yo'q (`// ponytail:`): "to'g'ri javoblarni topib olish" xavfi havza (200) va ko'rilganlarni o'tkazish bilan kamaytirilgan. Suiiste'mol ko'rinsa, `LevelTestAttempt.chatId + createdAt` bo'yicha cheklov qo'shiladi.

## Oqibatlar

- Yangi jadval `LevelTestAttempt` (migratsiya `20261024120000_level_test_attempt`).
- Savollar sifati — o'qituvchi ko'rigiga bog'liq. Ko'rikdan oldin 200 ta savolning daraja moslig'i va "bitta to'g'ri javob" qoidasi tekshirilmagan.
- Natija taxminiy: matnda shunday deyiladi. Aniq darajani o'qituvchi suhbatda belgilaydi.
- Havzaga savol qo'shish — faqat kod o'zgarishi (yangi `id` bilan), migratsiya kerak emas.
- Lid raqamni yubormagan odam uchun ochilmaydi; uning natijasi faqat `LevelTestAttempt` da qoladi.
