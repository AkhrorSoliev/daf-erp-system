# 0019. Mashq natijasi umumiy shartnomaga yoziladi, ko'nikma o'qishda hisoblanadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-13
**Bog'liq:** [0011](0011-oquv-ozagi-standartga-boglanadi.md) (Goethe o'qi),
[dizayn hujjati](../superpowers/specs/2026-09-13-oquvchi-ilova-faolligi-design.md) (5-bo'lim)

## Kontekst

O'qituvchi va admin o'quvchining mashq statistikasini ko'rishi kerak: to'g'ri javob
foizi, ko'nikma bo'yicha ajratish, seanslar tarixi, guruh qiynalayotgan so'zlar.
Hozirgi `DafAttempt` yozuvi bunga yetmasdi: urinish qaysi seans, savol va formatga
tegishli ekanini saqlamasdi; juftlash har bosishni alohida qator yozardi; xato
javob boshqa formatda qayta so'ralardi — qatorlarni sanash noto'g'ri foiz berardi;
takrorlash seansi hech qayerda qolmasdi.

Mashq formatlari ko'payib boradi (12 → 14 → …). Statistika formatga bog'lansa,
har yangi format uni buzadi.

## Qaror

1. **Har urinish umumiy shartnoma bilan yoziladi:** `sessionId`, `questionIndex`,
   `attemptNo` (1 — asl, 2 — o'rinbosar), `lessonId`, `itemType`, `itemId`,
   `format` (matn, enum emas), `score` (0..1), `gradingStatus`
   (`GRADED | PENDING | UNGRADED`). Statistika faqat shu maydonlarni o'qiydi va
   format nima ekanini bilmaydi.
2. **Seans natijasi serverda urinishlardan hisoblanadi** (`DafSession`), klient
   aytgan `richtig` ga ishonilmaydi. «To'g'ri javob %» — birinchi urinish bo'yicha,
   o'quvchi natija ekranidagi ta'rif bilan bir xil.
3. **Ko'nikma bazada saqlanmaydi** — o'qish paytida `format → ko'nikma` reyestridan
   (`format-skill.ts`). Xarita o'zgarsa eski natijalar ham yangi xarita bo'yicha
   ko'rinadi. Nafaqadagi formatlar reyestrda qoladi.
4. Ko'nikma qoidasi: o'quvchi mashqda **amalda nima qilyapti** (tayyor iborani
   tanlash — Wortschatz, Sprechen emas).

## Oqibatlar

- Yangi maydonlar ixtiyoriy: eski klient va eski DiB yo'llari buzilmaydi, ularning
  urinishlari savolga asoslangan ko'rsatkichlardan chetda qoladi.
- Kelajakda ko'nikma mashqning o'zida belgilansa (ADR-0011 yo'li), u reyestrdan
  ustun bo'ladi — statistika kodi o'zgarmaydi.
- Bitta format bitta ko'nikma degan faraz mukammal emas; foizlar tendensiya,
  tashxis emas.
- Seans yakuni ikkinchi darajali: `abschluss` avval dars progressini (`DafLessonProgress`) yozadi, keyin seansni yopadi; seansni yopishdagi xato (topilmadi / boshqa o'quvchiniki) logga yoziladi va o'quvchining dars natijasini hech qachon yo'qotmaydi (CEO qarori, 13.09.2026).
- Birinchi urinishdagi seans yaratish poygasi (bir vaqtda kelgan ikki javob) P2002 ni tutib, egalikni qayta tekshiradi.
- `HOEREN_WAHL` (eshitish mashqi) — Hören.
