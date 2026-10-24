# «Darajani aniqlash» — bot testi (dizayn)

Qaror: ADR-0121. Savollar: `2026-10-24-darajani-aniqlash-savollar.md`.

## Maqsad

Yangi odam botni ochadi, qisqa testdan o'tadi, taxminiy darajasini (A1…B2) biladi
va xohlasa telefonini qoldiradi. Administrator uni lid sifatida ko'radi va
qo'ng'iroq qiladi.

## Oqim

```
/start → «📊 Darajani aniqlash»
  → tanishtiruv + 1-savol
  → A1 (5 savol) → A2 (5) → B1 (5) → B2 (5)      HAMMA daraja so'raladi,
     oldingi daraja natijasi testni to'xtatmaydi (jami 20 savol)
  → natija (`judge`): darajalar A1 → B2 tartibida, har birida ≥4 to'g'ri kerak;
     birinchi o'tilmagan darajadan oldingi daraja = natija
  → natija matni  → «📱 Telefon raqamni yuborish» | «Keyinroq»
  → (o'z kontakti) → [filial tanlash, 2+ filial bo'lsa] → lid ochiladi
```

- Savol — bitta xabar, 4 inline tugma (A/B/C/D). Bosgach xabar "Javobingiz: …"
  ga o'zgaradi, to'g'ri javob ko'rsatilmaydi, keyingi savol yangi xabarda.
- Eski savol tugmasini bosish rad etiladi (`lt:<tartib>:<variant>`, tartib
  hozirgi savolniki bo'lishi shart).
- `/cancel` — test to'xtaydi, hech narsa saqlanmaydi. `/start` sahnani tozalaydi
  (umumiy middleware).
- Faqat shaxsiy chatda.

## Savol vaqti

- Daraja bo'yicha: A1 20 s, A2 30 s, B1 40 s, B2 50 s (`SECONDS_PER_LEVEL` — bitta
  jadval). Savol matnida: «Savol 3 · ⏱ 30 soniya».
- Vaqt tugasa: xabar «⏱ Vaqt tugadi — javob hisobga olinmadi» ga o'zgaradi, savol
  xato hisoblanadi, keyingisi beriladi. To'g'ri javob ko'rsatilmaydi.
- Tarmoq kechikishi uchun 3 s muhlat: shu vaqt ichida bosilgan javob o'tadi.
- Ketma-ket 3 ta savol javobsiz — test to'xtatiladi, urinish saqlanmaydi.
- Ikki qatlam: (1) sahna muddatni sessiyada (`deadlineAt`) saqlaydi va kech
  bosilgan tugmani o'zi rad etadi; (2) `TelegramService` muddat o'tgach botning
  o'ziga `ltt:<tartib>` yangilanishini yuboradi, shunda odam hech narsa
  bosmasa ham keyingi savol keladi. Taymer jarayon xotirasida: qayta ishga
  tushsa yo'qoladi, (1) baribir ishlaydi.
- Qolgan vaqt chizig'i (`⏱ ████░░░░░░  14 s`) har 5 soniyada yangilanadi
  (`TICK_SECONDS`): bot o'ziga `ltk:<tartib>` yangilanishini yuboradi va xabar
  tahrirlanadi. Har soniya emas — Telegram tez-tez tahrirlashni cheklaydi, 5 s
  esa A1 uchun 3, B2 uchun 9 tahrir. Tick javob/vaqt tugashi bilan to'qnashsa
  yoki savol allaqachon yopilgan bo'lsa o'tkazib yuboriladi.

## Xabar ko'rinishi (yagona xabar)

Test davomida bitta xabar tahrirlanib boradi: javob berilgan savollar to'planib,
tepada ixcham (ochiladigan) blokda turadi, pastda hozirgi savol.

```
📊 Daraja testi · 7 / 20
▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱

┃ 1. Ich ___ Anna. → bin          (ochiladigan blok)
┃ 2. Wir ___ Kaffee. → trinken
┃ 3. … → ⏱ javobsiz

Savol 7
Er ___ jeden Tag Brot.

A  isst
B  esse
C  esst
D  essen

⏱ ██████░░░░  14 s
              [ A ] [ B ] [ C ] [ D ]
```

- Variantlar matnda, tugmalar — bitta qatorda harflar (A–D).
- HTML format (`parse_mode: 'HTML'`), barcha matn `escapeHtml` dan o'tadi.
- Xabar 3800 belgidan oshsa, eng eski tarix qatorlari yashiriladi.
- Test tugagach xabar tugmasiz yakuniy ko'rinishga o'tadi (butun tarix), natija
  esa alohida xabarda. To'g'ri javob hech qayerda ko'rsatilmaydi.
- Xabar o'chirib yuborilsa (tahrir bo'lmasa), savol yangi xabarda yuboriladi.

## Ma'lumot

`LevelTestAttempt { id, chatId, questionIds[], correctByLevel (Json), result,
createdAt, leadId?, companyId }`. Urinish test tugaganda yoziladi; lid ochilsa
`leadId` to'ldiriladi.

## Chegaralar va ochiq nuqtalar

- Kuniga urinish chegarasi yo'q (ADR-0121, `// ponytail:`).
- Lid faqat "Yangi" ustunli bo'limi bor filialga ochiladi; yo'q bo'lsa odamga
  "administrator bilan bog'laning" deyiladi va logga yoziladi.
- Natija matni va "5 dan 4" chegarasi — CEO/o'qituvchi ko'rigidan keyin
  o'zgartirilishi mumkin (`PASS_MARK`, `level-test.texts.ts`).
- Xodim ko'rinishi: lid kartasida manba «Telegram bot — daraja testi», tarixda
  `darajaTesti`. Lid kartasida alohida "daraja" maydoni yo'q.
