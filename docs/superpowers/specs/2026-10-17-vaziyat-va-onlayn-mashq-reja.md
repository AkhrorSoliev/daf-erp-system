# Vaziyatlar va onlayn mashqlar — reja

Dizayn: `2026-10-17-vaziyat-va-onlayn-mashq-design.md`. Har vazifa TDD (avval yiqiladigan test), keyin kod, oxirida `npx jest <fayl>` yashil, `npx prettier --write`.

- [ ] **V1. Sxema va tiplar.** `DafDialog.art String @default("DIALOG")`, `DafSentence.kontextUz String?` (migratsiya, `prisma generate`). `Dialog.art`, `Satz.kontextUz` tiplari (`unit-inhalt.types.ts`). Seed (`inhalt-seed.service.ts`) ikkalasini yozadi; `lesetexte.json` ni `DafDialog` ga `art` bilan yozadi. Test: `inhalt-seed.service.spec.ts`.
- [ ] **V2. `LESEN_WAHL` serverda.** `FrageFormat`, `Frage.lesetext`, `PublicFrage.lesetext`; `lese-fragen.ts` (`lesenWahl`); `ladeMaterial` (`art` bo'yicha ajratish: audio — `HOEREN_WAHL`/`DIALOG_LUECKE`, matn — `LESEN_WAHL`); `richtigeAntwort`; DTO ro'yxatlari; `FORMAT_SKILL` (LESEN); `kind-formate` (UNIT_TEST, SECTION_A); `seans` cheklovi; admin ko'rik (`daf-media-fragen.service.ts`). Javobdan keyin matnning o'zbekcha tarjimasi (`transkript`) qaytadi.
- [ ] **V3. Gap konteksti.** `MaterialSatz.kontextUz`, `Frage.kontext`; `SATZ_HOEREN`, `SATZ_BAUEN`, `SATZ_UEBERSETZEN` kontekstni yuboradi.
- [ ] **V4. Qo'riqchilar.** `dialoge.json`: `ANSAGE` uchun bitta gapiruvchi; `lesetexte.json` fayl qoidalari (2 savol, progressiya, takror yo'q, art to'g'ri); `kontextUz` lotin harfida, ikki nuqtasiz. `unit-inhalt.file.spec.ts`.
- [ ] **V5. Mijoz.** `types.ts`, `koersatma.ts`, `daf-format-nomlari.ts`, `seans-ekrani.tsx`: `LESEN_WAHL` ekrani (matn/chat/jadval ko'rinishi + 3 variant), gap formatlarida kontekst qatori. Testlar (vitest).
- [ ] **V6. 6-unit kontenti.** 11 vaziyat → `dialoge.json` (16 audio matn, `DIALOG`/`ANSAGE`), `lesetexte.json`, `saetze.json` (hikoya satrlari, `kontextUz`, o'zbekcha), `redemittel.json`, `hilfswoerter.json`, `dialog-regie.json`. Hamma qo'riqchi yashil.
- [ ] **V7. Ko'rik.** O'quvchi ekranida qanday ko'rinishini ko'rsatadigan sahifa; CEO ko'rigi.
- [ ] **V8. Ovoz/rasm.** Narx so'raladi → ruxsatdan keyin yaratiladi (alohida bosqich).
