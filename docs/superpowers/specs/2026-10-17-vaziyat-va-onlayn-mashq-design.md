# Vaziyatlar va onlayn mashqlar — dizayn

**Sana:** 2026-10-17
**Bog'liq:** ADR-0071, ADR-0085, `2026-10-11-a1-u06-matni-design.md`, `2026-10-17-vaziyat-va-onlayn-mashq-reja.md`

## Muammo

CEO (17.10): hozirgi 187 ta yakka gap «rasvo» va mantiqsiz; gapning ovozi ham ma'nosiz. Netzwerk kitobining mashq turlarini nusxalash kerak emas: ovozning ma'nosi birinchi o'rinda, mashqlar esa ilovaning onlayn formatlariga mos bo'lishi shart. O'quvchi yolg'iz, telefonda: sherik ham, tekshiruvchi ham yo'q.

## Qaror

**Ma'no manbai — vaziyat.** Vaziyat = bir joy, bir vaqt, doimiy personajlar, tugal voqea (suhbat, telefon, e'lon, chat, plakat, e-mail). 6-unitda 11 ta (`scratchpad/u06n/sit/s1..s11.js`, ko'rik sahifasi `SF7e5mJ2AqSE2tgSqjMJmA`).

**Mashq — mavjud format.** Matnni mashqqa ilova o'zi aylantiradi. Kitobsifat topshiriqlar (jadval to'ldirish, anketa, xatni tuzish, aralash satrlarni tartiblash, moslashtirish, gapirish) QO'SHILMAYDI.

| Vaziyat matni | Format |
|---|---|
| Suhbat, telefon, e'lon (audio) | `HOEREN_WAHL` (eshitib javob), `DIALOG_LUECKE` (faqat suhbat) |
| Chat, e-mail, plakat, jadval (matn) | **`LESEN_WAHL`** — yangi: `HOEREN_WAHL` ning matnli ikkilamchisi |
| Matnlardagi gaplar | `SATZ_HOEREN`, `SATZ_BAUEN`, `SATZ_UEBERSETZEN` — gap oldida sahna ko'rsatiladi |
| Iboralar | `REAKTION` |

## Ma'lumot modeli

1. **`Dialog.art`**: `DIALOG` (standart) · `ANSAGE` (bitta ovoz, 3–8 satr; har satr — bitta gap) · `CHAT` · `TEXT` · `TABELLE`. `DafDialog.art` ustuni, standart `DIALOG`.
   - `DIALOG`, `ANSAGE` — audio bor; `HOEREN_WAHL` quriladi. Faqat `DIALOG` dan `DIALOG_LUECKE`.
   - `CHAT`, `TEXT`, `TABELLE` — audio YO'Q; `LESEN_WAHL` quriladi. `CHAT`: satr = gapiruvchi + gap. `TEXT`: satr = abzats (`sprecher` bo'sh). `TABELLE`: birinchi satr — sarlavha, qolganlari qator; kataklar ` | ` bilan ajratiladi.
2. **`lesetexte.json`** (yangi fayl, har unitda) — `CHAT`/`TEXT`/`TABELLE` matnlari, har birida aniq 2 ta savol (`HoerFrage` shakli). Seed ularni `DafDialog` ga `art` bilan yozadi.
3. **`Satz.kontextUz`** (`DafSentence.kontextUz`, ixtiyoriy): «Kassada. Claudia aytadi». Gap hikoya satridan olinadi; kontekst gap ovozi/tuzilishidan oldin ko'rinadi.
4. **`Frage.lesetext`** (`LESEN_WAHL`): `{ art, titel, zeilen[] }` — savol bilan birga yuboriladi. **`Frage.kontext`**: gap formatlari uchun sahna matni.

## Qoidalar

- Eshitish savoli qoidasi o'zgarmaydi: to'g'ri javob matnda so'zma-so'z bor, 2 savol, so'zlar tanish. `LESEN_WAHL` uchun ham shu (`validateHoerFragen`). Farq: o'qish savolida javob matnda ko'rinib turadi, shuning uchun chalg'ituvchilar «matndan aniq xato» bo'lishi shart.
- `LESEN_WAHL` va `HOEREN_WAHL` bir matnni ikkalasi ham so'ramaydi (matn va ovoz alohida material).
- Suhbat qoidalari (4–8 satr, ≥2 gapiruvchi) `DIALOG` uchun qoladi; `ANSAGE` uchun bitta gapiruvchi ruxsat.
- Hikoya qoidasi (`feedback_dialog_tugal_hikoya`): bir joy, uzilmas vaqt, boshlanish → muammo → yechim → oxiri.

## Qamrab olinmaydi

- Audio va rasm yaratish (pullik, alohida ruxsat).
- Gapirish va erkin yozish mashqlari.
- 1–5 va 7–12-unitlarni qayta qurish (6-unit tasdiqlangach, shu tartib bo'yicha).
