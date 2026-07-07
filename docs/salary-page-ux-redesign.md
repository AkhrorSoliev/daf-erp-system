# Ish haqi (/payments/salary) — UX redizayn brief

> Status: DESIGN BRIEF (kod yozilmagan). Tasdiqlangach implement qilinadi.
> Qarorlar (2026-06-29): 3-bosqichli tasdiqlash saqlanadi · asosiy ko'rinish = oylar kesimida matritsa · avval brief.

## 1. Maqsad va foydalanuvchilar
- **Foydalanuvchi**: CEO (to'liq), Filial direktori (to'lash, o'z filiali), Administrator (ko'rish). Ofisda, kunduzi, hisobdorlik kayfiyatida, desktop'da.
- **Asosiy ehtiyoj**: "har bir ustoz qaysi oyda qancha oldi/oladi" ni bir qarashda ko'rish + oylikni boshqarish (hisoblash → tasdiqlash → to'lash).
- **Hozirgi muammo**: sahifa uch ishni (monitoring, workflow, sozlama) aralashtirgan; oylar kesimida ko'rinish va davr filteri yo'q; tasdiqlash bosqichi tushunarsiz; "Joriy davrni qo'lda hisoblash" sozlama emas, lekin sozlamalar ichida.

## 2. Asosiy vazifalar (jobs-to-be-done)
1. **Ko'rish**: ustoz × oy kesimida oyliklar (asosiy).
2. **Boshqarish**: tanlangan oy uchun Hisoblangan → Tasdiqlash → To'lash (+ batch).
3. **Sozlash**: stavkalar (Oylik belgilash), davr (Hisoblash davri) — kamdan-kam.
4. **Operatsiya**: davrni qo'lda hisoblash — kamdan-kam, favqulodda.

## 3. Axborot ierarxiyasi (asosiy qayta tuzilma)
Uchta narsani ajratamiz:
- **Monitoring + workflow** = sahifaning asosiy kontenti (2 ko'rinish).
- **Sozlamalar** (stavka + davr) = `⚙ Sozlamalar`, hot-path'dan tashqarida, ikki aniq guruh.
- **Davrni qo'lda hisoblash** = sozlama EMAS; davr konteksti yonida, CEO-only, kam ko'rinadigan amal.

Ikki ko'rinish, URL `?view=` bilan saqlanadi:
- **Oylar kesimida** (default, matritsa) — overview, o'qish uchun.
- **Davr boshqaruvi** (bitta oy ro'yxati) — workflow (tasdiqlash/to'lash) shu yerda.

## 4. Tepa panel (ikkala ko'rinishda umumiy)
```
Ish haqi                                  [Davr: Mart–Iyun ▼]   [⚙ Sozlamalar]
Xodimlar oyligini boshqarish

[ Oylar kesimida ]  [ Davr boshqaruvi ]          ← ko'rinish toggle (segmented)
```
- **Davr filteri**: oy-range picker (default oxirgi 3–6 oy). URL-persisted (`?from=2026-03&to=2026-06`). Matritsa ustunlarini va workflow oyini boshqaradi.
- **⚙ Sozlamalar** dropdown — faqat 2 ta SOZLAMA: "Oylik stavkalari", "Hisoblash davri". (Hisoblash amali bu yerda EMAS.)

## 5. Ko'rinish 1 — Oylar kesimida (matritsa, DEFAULT)
```
┌─ Workflow holati: Iyun 2026 ──────────────────────────────────────────────┐
│  Hisoblangan 5 (12.4M)   Tasdiqlangan 0   To'langan 0    [Iyunni boshqarish →] │
└───────────────────────────────────────────────────────────────────────────┘

Ustoz \ Oy          Mart       Aprel      May         Iyun
──────────────────────────────────────────────────────────────────────────
Jamsher #10010      —          —          20 840 343  hisoblanmagan
Eldor #10008        —          —          7 566 591   —
Sohibaxon #10006    —          —          6 566 601   —
... (sticky birinchi ustun: ustoz)
──────────────────────────────────────────────────────────────────────────
JAMI                ...        ...        57 179 981  ...
```
- **Qator** = ustoz (sticky, chap), **ustun** = oy (sticky header). **Katak** = summa + holat rangi.
- **Holat ranglari**: Hisoblangan (amber), Tasdiqlangan (blue), To'langan (green), yo'q (faint "—").
- **Katakni bosish** → mavjud `SalaryBreakdownDrawer` (dars-by-dars). Qo'lda kiritilgan (Excel) yozuvlar — "Qo'lda kiritilgan, dars tafsiloti yo'q" izohi + kichik `qo'lda` belgisi.
- **Pastda JAMI qatori** (oy bo'yicha), o'ngda ixtiyoriy ustoz-jami ustuni.
- **Tepada workflow-holat lentasi**: tanlangan/oxirgi oy uchun nechta hisoblangan/tasdiqlangan/to'langan + CTA "Iyunni boshqarish →" (Davr boshqaruvi ko'rinishiga oy bilan o'tadi). Bu — tasdiqlash bosqichini ko'rinadigan qiladi.
- Ustun (oy) sarlavhasini bosish ham o'sha oyni Davr boshqaruvida ochadi.

## 6. Ko'rinish 2 — Davr boshqaruvi (bitta oy, WORKFLOW)
```
[ Oylar kesimida ]  [ Davr boshqaruvi ]            Oy: [ Iyun 2026 ▼ ]

Bosqich:  ● Hisoblangan 5   →   ○ Tasdiqlangan 0   →   ○ To'langan 0
                                          [Hammasini tasdiqlash]  [Hammasini to'lash (0)]

#  Ustoz                 Summa        Holat         Amal
1  Jamsher #10010        20 840 343   Hisoblangan   [Tasdiqlash]
2  Eldor #10008          7 566 591    Hisoblangan   [Tasdiqlash]
...                                                  ↑ keyingi bosqich tugmasi
```
- **Stepper** (Hisoblangan → Tasdiqlangan → To'langan) — har bosqichda nechta yozuv borligi. 3 bosqich aniq ko'rinadi (tushunmovchilik #3 hal bo'ladi).
- **Qator amali = KEYINGI bosqich**: Hisoblangan → `Tasdiqlash`; Tasdiqlangan → `To'lash`; To'langan → sana.
- **Batch**: "Hammasini tasdiqlash" (CEO), "Hammasini to'lash (N)" (CEO/BD).
- **Helper**: stepper ostida bir qatorli izoh — "Tasdiqlash: pul harakatisiz CEO tekshiruvi. To'lash: ustoz balansidan ayiriladi." (tooltip yoki info satr).
- Qatorni bosish → breakdown drawer (xuddi matritsadagi kabi).
- Rol: Tasdiqlash CEO; To'lash CEO/BD (BD faqat o'z filiali, mavjud scope).

## 7. Workflow aniqligi (3 bosqich)
- Status badge'lar va stepper bitta vizual tilda: amber/blue/green.
- Har joyda "keyingi amal" tugmasi (bosqichni oldinga suradi).
- To'lash — moliyaviy amal: tasdiq dialogi summani va "ustoz balansidan ayiriladi" ni ko'rsatadi.
- **To'lash vaqtida balans ogohlantirishi** (kelajak uchun): agar to'lov ustoz balansini minusga tushirsa (masalan May Excel yozuvlari kreditlanmagan), dialogda ogohlantirish: "Balans minusga tushadi (−X). Davom etilsinmi?".

## 8. Sozlamalar ajratilishi
`⚙ Sozlamalar` dropdown — faqat 2 ta:
- **Oylik stavkalari** → mavjud `salary-config-bulk-dialog` (xodim × stavka).
- **Hisoblash davri** → mavjud `salary-period-settings-sheet` ("8-kun default" matni olib tashlangan, Faza 1).
"Davrni tanlab hisoblash" (Faza 1 dialog) — bu yerda EMAS. U Davr boshqaruvida, oy konteksti yonida, CEO-only "⋯ → Bu davrni qayta hisoblash" amali sifatida (favqulodda; kron odatda avtomatik).

## 9. Holatlar
- **Bo'sh** (davrda oylik yo'q): "Bu davrda oylik hisoblanmagan" + (CEO) "Davrni hisoblash" CTA.
- **Loading**: skeleton matritsa / skeleton qatorlar (spinner emas).
- **Xato**: qisqa xabar + "Qayta urinish".
- **Qo'lda yozuvlar**: matritsa katagida + drawerda `qo'lda` belgisi va izoh.

## 10. Mobil/responsiv
- Matritsa keng → mobilda **Davr boshqaruvi (bitta oy ro'yxati)** default bo'ladi; oy-switcher bilan oydan-oyga.
- Yoki matritsa: sticky ustoz ustuni + gorizontal scroll (desktop-first). Mobil = bitta-oy ro'yxat afzal.

## 11. Qayta ishlatiladigan komponentlar
- `SalaryBreakdownDrawer` (katak/qator → tafsilot) — saqlanadi, qo'lda-yozuv holatini qo'shamiz.
- `salary-config-bulk-dialog`, `salary-period-settings-sheet` — Sozlamalar ostida.
- `salary-calculate-dialog` (Faza 1) — Davr boshqaruvidagi "qayta hisoblash" amaliga ko'chiriladi.
- Status badge ranglari (mavjud `statusColors`), `formatPrice`, `# border-r` jadval konvensiyalari, URL-persisted filter/tab (CLAUDE.md).

## 12. Vizual til (mavjud tizim — o'zgarmaydi)
- shadcn/ui + Tailwind, **light theme**, **Restrained** rang (neutrallar + bitta accent), Inter/system shrift.
- Accent faqat: asosiy amal, joriy tanlov, status. Bezak uchun emas.
- Status: amber=Hisoblangan, blue=Tasdiqlangan, green=To'langan, red=Bekor.
- Zichlik: jadval zич bo'lishi mumkin (ko'p ustoz/oy). Bir xil shadcn jadval/badge/dialog tili.

## 13. Ko'lam tashqarisi / ochiq nuqtalar
- Backend: matritsa endpoint (`GET /salary/matrix?from&to`) — Faza 2 rejada bor, implementatsiyada qo'shiladi.
- Pay-time balans masalasi (May Excel) — alohida follow-up; UI faqat ogohlantirishni qo'shadi.
- Eski balans ledger nomuvofiqligi — bu redizayn doirasidan tashqari.

## 14. Muvaffaqiyat mezoni
- CEO sahifani ochib, **darrov** ustoz × oy oyliklarini ko'radi (filter bilan).
- Tasdiqlash/to'lash bosqichlari va "keyingi amal" aniq.
- Sozlamalar (kamdan-kam) asosiy oqimni to'smaydi.
- "Joriy davrni qo'lda hisoblash" endi chalg'itmaydi (to'g'ri joyda, to'g'ri nom).
