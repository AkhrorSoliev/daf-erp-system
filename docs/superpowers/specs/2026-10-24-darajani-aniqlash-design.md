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
  → A1 (5 savol) → ≥4 to'g'ri? → A2 (5) → ≥4? → B1 (5) → ≥4? → B2 (5)
     ↓ (4 dan kam)                                          ↓
  natija = oxirgi o'tilgan daraja            natija = «B2 yoki yuqori»
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
- Orqaga sanash yo'q (Telegram xabarni tez-tez tahrirlashni cheklaydi): vaqt
  savol matnida bir marta yoziladi.

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
