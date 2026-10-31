# Reja — foydalanilmagan darslar qarzini bekor qilish

Spec: `docs/superpowers/specs/2026-10-31-foydalanilmagan-darslar-qarzini-bekor-qilish-design.md`

1. **Server — o'qish.** `billing/unused-departure-lessons.ts`: `barredLessonDays`ni qayta ishlatib, DROPPED/EXPELLED yozilishning CHARGED oylik hisoblaridan foydalanilmagan kunlar va narxini qaytaradigan funksiya. `GET /students/:id/unused-barred-lessons` kontroller yo'li.
2. **Server — yozish.** `cancelled-lesson-release.ts` naqshi bo'yicha: tanlangan kunlarni charge bo'yicha guruhlab, har biriga ADJUSTMENT + `frozenOutDates`, ikki qulf (charge miqdori, umumiy qarz). `POST /students/:id/unused-barred-lessons/write-off`.
3. **Client.** Profil kartasidagi «To'lov» dropdownga band, yangi dialog (checkbox ro'yxat, jami summa, sabab, tasdiqlash). i18n (ru/de/en).
4. **Sinov.** Server unit (hisoblash, ikki qulf), client unit (dialog hisob-kitobi), throwaway bazada haqiqiy yo'l.
5. **PR, CI, merge, deploy.**
