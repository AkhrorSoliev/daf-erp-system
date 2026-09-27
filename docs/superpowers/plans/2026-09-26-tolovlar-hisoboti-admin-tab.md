# To'lovlar hisoboti — 2-bosqich: admin «To'lovlar» tabi (reja)

**Maqsad:** O'quvchi profilidagi «To'lovlar» tabida (CEO, filial direktori,
administrator) `BalanceSummaryCard` va 20 yozuvli lenta o'rniga server
qurgan «To'lovlar hisoboti» chiqadi. Spec:
`docs/superpowers/specs/2026-09-26-tolovlar-hisoboti-design.md`, «Admin:
«To'lovlar» tabi». ADR-0037.

## Qoidalar

- Hamma matn `view` dan olinadi (`GET /students/:id/statement`, admin tili).
  Client faqat sonlar va dars kunlari uchun `model` ni o'qiydi; gap yozmaydi.
- `view.months[i]` ↔ `model.months[i]`, `view.allocations[i]` ↔
  `model.allocations[i]` — bir xil tartib, server shunday quradi.
- Summalar `font-mono tabular-nums`. shadcn (radix-vega) va lucide.
- Deploy yo'q. PR merge qilinadi, chiqarish CEO ruxsati bilan alohida.

## Vazifalar

1. **Server: to'lov vaqti.** «Summani to'g'rilash» 72 soat qoidasi uchun
   to'lovning aniq vaqti kerak, `day` yetmaydi. `StatementRow.at` va
   `Allocation.at` (ISO, kredit uchun `null`) qo'shiladi. Test:
   `statement-analysis`/`build-statement` spec'ida `at` to'lovdan o'tadi.
2. **Client sof yordamchilar** (`statement/statement-utils.ts`, vitest):
   - `canCorrectPayment` — CEO har doim, 1–3 rollar 72 soat ichida, faqat
     `paymentId` bor va summa musbat bo'lsa;
   - dars holati → chip rangi va yorlig'i;
   - `appendLedgerPage` — «Yana ko'rsatish» sahifalarini id bo'yicha
     takrorsiz qo'shadi.
3. **Komponentlar** (`client/src/components/students/statement/`):
   - `payment-statement.tsx` — yuklash, sarlavha, PDF tugmasi (blob, auth),
     ogohlantirish, javob qutisi, tenglama, paket qatori, bo'limlar;
   - `statement-months-table.tsx` — oylar jadvali, sariq qator va izoh,
     qator bosilganda dars kunlari chiplari;
   - `statement-allocations.tsx` — «To'lovlar qayerga ketdi», «Chek» va ⋯
     «Summani to'g'rilash»;
   - `statement-ledger.tsx` — yopiq «Barcha yozuvlar», 20 tadan, «Yana
     ko'rsatish»;
   - `receipt-link.tsx` — mavjud «Chek» havolasi `paymentId` bilan.
   Static render testlari (`renderToStaticMarkup`): javob qutisi rangi,
   ogohlantirish, sariq qator, chiplar, Chek havolasi.
4. **Ulash:** `student-profile-tabs.tsx` yangi komponentni chiqaradi; eski
   `student-payments-table.tsx`, `balance-summary-card.tsx`,
   `payment-effect-card.tsx`, `lesson-deduction-group.tsx` o'chiriladi.
   `client/CLAUDE.md` dagi tab tavsifi yangilanadi.
5. **Tekshiruv:** `server: npm test -- statements`, `client: npm test`,
   `npx eslint src`, `npm run build`. PR (inglizcha), CI yashil.
