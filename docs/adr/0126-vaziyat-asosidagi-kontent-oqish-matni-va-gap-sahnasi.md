# ADR-0126 — Kontent vaziyat asosida quriladi: o'qish matni (`LESEN_WAHL`), e'lon (`ANSAGE`) va gap sahnasi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0071, ADR-0085, `docs/superpowers/specs/2026-10-17-vaziyat-va-onlayn-mashq-design.md`, `server/src/daf/uebung/lese-fragen.ts`, `server/src/daf/inhalt/unit-inhalt.types.ts`

## Kontekst

17.10.2026 CEO unit mashqlarini ko'rib, gaplar yakka-yakka, bir-biriga bog'lanmagan va ba'zan mantiqsiz ekanini aytdi. Sababi: gaplar so'z ro'yxatidan «yasalgan» edi, ularni bitta voqea birlashtirmasdi. CEO Netzwerk Kursbuch va Übungsbuch, Goethe Modellsatz va rasmiy audio transkriptlarni berdi. Tahlil shuni ko'rsatdi: kitobda har topshiriq bitta mikro-vaziyatga (joy, vaqt, doimiy personajlar) bog'langan, matnlar haqiqiy shaklda (chat, e'lon, jadval, taklifnoma).

CEO ikki narsani aniq aytdi: (1) ovozlarning **ma'nosi** birinchi o'rinda, Netzwerk mashq turlarini birma-bir ko'chirish kerak emas; (2) mashqlar **onlayn** ilovaga mos bo'lsin: o'quvchi telefonda yolg'iz, yonida sherik ham, tekshiruvchi ham yo'q.

## Qaror

1. **Ma'no birligi — vaziyat.** Har bo'limda bir necha vaziyat: bitta joy, uzluksiz vaqt, qaytib keladigan personajlar, tugagan hikoya. Dialog, e'lon, chat, jadval va yakka gaplar shu vaziyatdan olinadi.
2. **Onlayn shakl — mavjud formatlar + bitta yangisi.** `HOEREN_WAHL`, `DIALOG_LUECKE`, `SATZ_*`, `REAKTION` o'z joyida qoladi. Yangi format `LESEN_WAHL`: o'quvchi matnni (chat, xat, e'lon, jadval) o'qiydi va uch variantli savolga javob beradi. Matn savol bilan birga ko'rinadi, tarjimasi javobdan keyin ochiladi (`HOEREN_WAHL` ning o'qish egizagi).
3. **Netzwerk'ning sherik, tekshiruvchi yoki qo'lda yozishni talab qiladigan topshiriqlari ko'chirilmaydi:** jadval to'ldirish, forma, xat yozish, gapirish juftlikda, matnni tartiblash, juftlash.
4. **Ma'lumot modeli (kichik).** `DafDialog.art` (`DIALOG` | `ANSAGE` | `CHAT` | `TEXT` | `TABELLE`, standart `DIALOG`): o'qish matni ham `DafDialog` qatori, audiosiz. Unit kontentiga ixtiyoriy `lesetexte.json` qo'shiladi. `DafSentence.kontextUz` — gap qaysi sahnadan ekani; savolda `Frage.kontext` bo'lib, gap oldida bitta qator sifatida ko'rinadi. Migratsiya: ikkita `ADD COLUMN IF NOT EXISTS`.
5. **`ANSAGE` — bitta ovozli audio matn** (radio, kassa, klub e'loni); har satri bitta gap, 2–6 satr. U `HOEREN_WAHL` ga yaraydi, `DIALOG_LUECKE` ga yaramaydi (bo'shatiladigan javobi yo'q). `CHAT`, `TEXT`, `TABELLE` ham `DIALOG_LUECKE` dan chetda.
6. **Qo'riqchilar.** O'qish matni ham eshitish matni kabi 2 ta tushunish savoli, progressiya qoidasi va lotin alifbosi tekshiruvidan o'tadi. Progressiya tekshiruvi (`unknownWordsIn`) raqam, tire, ikki nuqta, qo'shtirnoq va `/` ni so'z deb hisoblamaydi, chiziqchali qo'shma so'zni (`Basketball-Kurs`) bo'lak-bo'lak tekshiradi.
7. **Reja o'zgardi.** CEO qarori bilan Kurs, Karte, liebe va Gruß so'zlari u10–u12 dan u06 ga ko'chdi (so'z byudjetlari mos o'zgardi). `Ihre`, fe'l shakllari, ismlar va shahar nomlari yordamchi ro'yxatga qo'shildi.

## Ko'rib chiqilgan muqobillar

- **Netzwerk mashqlarini birma-bir ko'chirish.** Rad etildi (CEO): ma'no birinchi; kitob mashqlarining yarmi sherik yoki qog'oz talab qiladi.
- **Alohida `Lesetext` jadvali.** Rad etildi: o'qish matni ham sarlavha, sahna, satr, 2 savol va bo'limga ega, ya'ni `DafDialog` bilan bir xil. Ikki jadval ikki xil seed, tozalash va qo'riqchi demakdi.
- **Gap sahnasini gapning o'zi ichida yozish.** Rad etildi: sahna qatori gap matni emas, u javob tekshiruviga, audioga va so'z bo'laklariga kirmasligi kerak.

## Oqibatlari

- Eski gap formatlari o'zgarmadi: `kontext` bo'sh bo'lsa maydon umuman yuborilmaydi.
- Mijoz `PublicFrage.lesetext` va `kontext` ni chizadi; server hali yangi ilova bilan birga deploy qilinishi kerak (eski ilova `LESEN_WAHL` ni tanimaydi).
- Har unit qayta yozilganda shu qoida bo'yicha yoziladi (u06, keyin u03, u02, u01).
- Yordamchi ro'yxatdagi `nachtrag` so'zlari (Frage, Telefonnummer…) asosiy unit yozilganda ro'yxatdan olib tashlanadi, aks holda qo'riqchi yiqiladi.
