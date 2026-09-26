# To'lovlar hisoboti — 3-bosqich: o'quvchi portali kartasi (reja)

**Maqsad:** `/portal/payments` sahifasida «Joriy balans» kartasi ostida Lumio
kartasi: «To'lovlar hisoboti — Har bir to'lovingiz qaysi darslarga ketgani,
oyma-oy» va coral «PDF yuklab olish» tugmasi. Spec:
`docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`, «O'quvchi
portali». Server tayyor: `GET /student-portal/statement.pdf` (1-bosqich).

## Qoidalar

- PDF blob sifatida, token bilan olinadi (admin tabidagi kabi). Umumiy
  yordamchi `client/src/lib/download-file.ts` ga chiqariladi va admin tabi ham
  shundan foydalanadi.
- Fayl nomi server bilan bir xil: `tolovlar-hisoboti-DD-MM-YYYY.pdf`, sana
  Toshkent kuni (`tashkentNow`).
- Lumio primitivlari (`Card`, `IconTile`, `Button variant="primary"`).
  Qolgan kartalar o'zgarmaydi.
- Xato bo'lsa toast: «PDF yuklab olishda xatolik».
- Deploy yo'q.

## Vazifalar

1. `statementFileName(dateStr)` — test, keyin kod.
2. `StatementCard` — static render testi (sarlavha, izoh, tugma), keyin kod.
3. `student-payment-summary.tsx` ga «Joriy balans» ostida qo'shish.
4. `download-file.ts` ga ko'chirish, admin tabini ulash.
5. `npm test`, `npx eslint src`, `npm run build`; PR (inglizcha), CI yashil.
