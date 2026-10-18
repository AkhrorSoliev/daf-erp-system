# ADR-0111 — Dars baholari hisoboti to'liq anonim

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0091

## Kontekst

ADR-0091 da hisobot faqat CEO'ga ochiq. O'quvchi past baho va izoh yozganda ism ko'rinsa, u ochiq yozmaydi; baholarning ishonchliligi pasayadi. CEO ismni ko'rishni emas, ustoz va guruh bo'yicha tendensiyani ko'rishni xohlaydi.

## Qaror

1. **Hisobot to'liq anonim:** hech bir ekranda va hech bir API javobida o'quvchining ismi yoki id'si yo'q (`low`, `teacher`, `summary`).
2. **«Ko'rsatish» (ochish) funksiyasi yo'q** va qo'shilmaydi.
3. **Bot o'quvchiga aytadi:** «hech kimga ismingiz ko'rinmaydi».
4. **`studentId` faqat bazada** qoladi, yagona maqsad: bir dars va o'quvchiga takroriy so'rovni oldini olish (`groupId + studentId + date` unikal).
5. Izoh holati hisobotda ko'rinadi (`WRITTEN` / `PENDING` / `NOT_WRITTEN`), `sentAt` + 48 soatdan hisoblanadi; shaxsni ochmaydi.

## Taqiqlanadi

- Baho yoki izoh javobiga o'quvchi ismi, id'si yoki uni aniqlatuvchi maydon qo'shish.
- `LessonRating` dan o'quvchi bo'yicha hisobot qurish.

## Oqibatlar

ADR-0091 o'zgarmaydi; ism ko'rsatilishi haqidagi har qanday joy shu qaror bilan bekor.
