# ADR-0084 — Dialog ovozi Gemini 3.8 da, har obrazning o'z ovozi; unitlar navbat bilan o'tkaziladi

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0071, `server/src/daf/media/fal-client.ts`, `server/src/daf/inhalt/dialog-audio.ts`, `server/content/daf/a1/stimmen.json`

## Kontekst

26.09.2026 dan beri kurs dialoglari Gemini 3.1 Flash TTS (`fal-ai/gemini-3.1-flash-tts`) suhbat rejimida yasalardi. `stimmen.json` da 12 obrazga atigi 3 ta ovoz berilgan edi: barcha erkaklar Iapetus, ayollar Erinome yoki Callirrhoe. CEO 5-unit ko'rigida (11.10.2026) Mia va Helga ovozi deyarli bir xil ekanini, ovozlar nemis tilida ona tilidagidek emasligini aytdi.

CEO 5-unitning 1-dialogini uch xil variantda tingladi: Gemini 3.1 va 3.8, ikki xil ovoz juftligi, A1 uchun «sekin va aniq, Germaniya talaffuzi» ko'rsatmasi bilan. U Gemini 3.8 ni (Jonas — Puck, Mia — Aoede) tanladi. Keyin qolgan obrazlar uchun ikkitadan nomzodni tinglab, har biriga ovoz tanladi.

## Qaror

1. **Kurs dialoglari Gemini 3.8 Flash TTS da yasaladi** (`google/gemini-3.8-flash-tts`). Bu model bitta matn o'rniga navbatlar (`turns`) oladi; har satrning ohangi o'sha navbatning `style_instructions` iga o'tadi. Javob WAV, u R2 ga yuklashdan oldin mp3 ga o'tkaziladi (`audio-format.ts`).
2. **Har obrazning o'z ovozi bor** (`stimmen.json`, CEO tinglab tanlagan): Jonas — Puck, Mia — Aoede, Thomas — Algieba, Lukas — Zubenelgenubi, Julia — Laomedeia, Anna — Kore, Sabine — Sulafat, Helga — Gacrux. Walter, Claudia, Markus va Peter ovozi ularning unitiga navbat kelganda tanlanadi.
3. **Har sahnaga qo'shiladigan ko'rsatma:** «Hochdeutsch mit natürlicher Aussprache aus Deutschland, wie Muttersprachler. Langsam und sehr deutlich, wie in einer Hörübung für Anfänger (A1), mit einer kleinen Pause nach jedem Satz.»
4. **Unitlar navbat bilan o'tkaziladi** (CEO, 11.10: avval 5-unit, keyin 4-unit). Navbati kelmagan unitning Gemini 3.1 yozuvlari saytda qoladi va kontent tekshiruvida xato hisoblanmaydi (`FRUEHERES_GEMINI_MODEL`). Bitta unit ichida ikki model aralashmaydi: unit uchun skript yuritilsa, uning 3.1 yozuvlari ham qayta yasaladi.

## Ko'rib chiqilgan muqobillar

- **Inworld yoki MiniMax'ning nemischa ovozlari.** Rad etildi (CEO, 11.10): Google'da qolish so'raldi; Inworld'da nemischa ovoz ikkitagina, suhbat esa gapma-gap ulanadi.
- **Google Cloud'ning nemischa Chirp 3 HD ovozlari.** Ko'rib chiqilmadi: fal.ai da yo'q, alohida hisob va kalit kerak.
- **Hamma unitni bir yo'la qayta yozish.** Rad etildi: CEO har unitni to'liq tugatib, keyingisiga o'tishni xohladi.
- **Vaqt o'tganini hikoyachi gapi bilan bildirish** («Zehn Minuten später.»). Rad etildi (CEO, 11.10): Netzwerk va Goethe audiolarida bunday yo'q. Har dialog bitta joyda va uzluksiz vaqtda bo'ladi.

## Oqibatlari

- 1–4-unitlarni o'quvchi ularning navbati kelgunicha eski ovozlarda eshitadi; bir obraz unitdan unitga boshqa ovozda bo'lishi mumkin.
- `stimmen.json` dagi ovoz o'zgarsa, o'sha obraz qatnashgan, hali qayta yozilmagan dialoglar o'zgarmaydi: ovoz yozuv paytida tanlanadi, matn izi (`textHash`) ovozni o'z ichiga olmaydi.
- Narx: 3.8 da 1000 belgi $0.045 (3.1 da $0.05 edi).
