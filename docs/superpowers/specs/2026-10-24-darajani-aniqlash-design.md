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
