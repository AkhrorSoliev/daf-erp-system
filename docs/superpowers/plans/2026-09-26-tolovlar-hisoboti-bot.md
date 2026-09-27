# To'lovlar hisoboti — 4-bosqich: Telegram bot «💳 To'lovlar» (reja)

**Maqsad:** Botdagi «💳 To'lovlar» tugmasi («Tez kunda» o'rniga) o'quvchiga
javob qutisining matnini va to'liq hisobotni PDF fayl qilib yuboradi. Spec:
`docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`, «Telegram
bot». ADR-0037.

## Qoidalar

- Hisobot `StatementService.pdf()` dan olinadi (o'quvchi tilida). Matn
  `presentStatement(model, 'student').answer` dan: sarlavha va ostidagi qator.
  Botda gap qayta yozilmaydi.
- Fayl nomi: `statementFilename(model, false)` →
  `tolovlar-hisoboti-DD-MM-YYYY.pdf`. `replyWithDocument({ source, filename })`.
- **Chat bitta o'quvchiga ulangan** → darhol yuboriladi.
- **Chat bir necha o'quvchiga ulangan** → avval ism tugmalari. Tanlangan id
  shu chatga ulangan o'quvchilar ro'yxatida bo'lishi shart (bazadan qayta
  tekshiriladi), aks holda hech narsa yuborilmaydi.
- **Chat ulanmagan** → «📱 Telefon raqamni yuborish». Faqat
  `contactBelongsToSender` o'tkazgan raqam qabul qilinadi (parolni tiklashdagi
  kabi). Raqam bir necha o'quvchiga tegishli bo'lsa (masalan aka-uka), hammasi
  shu chatga ulanadi va ism so'raladi.
- Bir vaqtda ikkinchi bosish ishlamaydi (`withProcessingLock`).
- Yangi HTTP route yo'q, `branch-route-policy.ts` o'zgarmaydi.
- Deploy yo'q.

## Vazifalar

1. `flows/statement-flow.ts`: chat/raqam bo'yicha o'quvchilar, chatni ulash,
   xabar matni. Testlar birinchi.
2. `scenes/statement.scene.ts`: kirish, kontakt, ism tanlash, yuborish.
   Testlar: ulangan, bir nechta, ulanmagan (o'z raqami), begona raqam, boshqa
   chatning o'quvchisini tanlashga urinish.
3. `TelegramModule` ← `StatementsModule`; `menu_payments` sahnaga kiradi,
   «Tez kunda» ro'yxatidan chiqadi.
4. `npm test`, lint, build; PR (inglizcha), CI yashil.
