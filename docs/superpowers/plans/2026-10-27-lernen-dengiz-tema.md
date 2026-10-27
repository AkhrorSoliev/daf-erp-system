# Ta'lim dizayni — 4-bosqich («Dengiz» temasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Dengiz» temasini qurish va Sozlamalarda tanlashga ochish: yo'l va unit sahifasi orqasida uch zonali (marjon rifi, kelp o'rmoni, chuqur dengiz) sho'ng'ish sahnasi — 3-bosqichdagi O'rmondan ancha arzon (bitta harakatlanuvchi qatlam: chetdagi ikki tor qoya tasmasi), pufakchalar, baliqlar, tebranuvchi o'simliklar, yorug'lik nurlari; dengiz tuguni; unit sahifasida darslar sahnadagi joy (chig'anoq uyi, kema, g'or, xazina; qulflilari qorong'ulikda); zona chuqurligi yozilgan lavha; mukofot foni; kartadagi miniatyura.

**Architecture:** 3-bosqich infratuzilmasi to'liq qayta ishlatiladi: `LernenTema` shartnomasi (`Sahna`, `UnitJoyi`, `Miniatyura`), `SahnaRamka` va pardalar, `harakat/use-sahna.ts` (`useYengilRejim`, `useSahnaPauza`, `useParallaks`), `layerOffset`/`scenePaused`, sahifalarning sahna simlari (`BIOME_SETTLE_MS`, `joriyUnitTartibi`), `[data-sahna]` ga bog'langan shisha/overlay qoidalari, `TemaRasmi`. O'rmonning temaga bog'liq bo'lmagan mantig'i ikki umumiy modulga ko'chadi (`tema/sahna-umumiy.ts` — sof yordamchilar; `tema/sahna-qismlari.tsx` — `SharTugun`, `SahnaJoy`, `SahnaMukofotFoni`), O'rmon ularning ingichka o'ramiga aylanadi va markup'i bayt-ma-bayt o'zgarmaydi. Dengizning o'zi faqat palitra, sof reja/shakl funksiyalari, bezak SVG'lari, sahna va CSS'dan iborat; sahifalarga tegilmaydi.

**Tech Stack:** Next.js 16 + React 19 + Tailwind 4 (client), inline SVG (seed'li tasodif), CSS `@keyframes` (faqat `transform`/`opacity`), mavjud bitta `requestAnimationFrame` (parallaks), Vitest node-muhiti (DOM yo'q, `renderToStaticMarkup`), Playwright + CDP (faqat o'lchov skripti, repoga kirmaydi).

**Spec:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§3, §5, §8 «Dengiz» qatori, §9, §10, §11, §12 bosqich 4, §14) · **ADR:** ADR-0125, ADR-0128, ADR-0131, `docs/adr/0132-lernen-ormon-tema-sahna-va-joy-orinlari.md` · **Mockup (CEO tasdiqlagan):** `docs/superpowers/mockups/2026-10-24-lernen-dizayn/dengiz.html` (`UBG`, `PAL`, `wall`, `ridges`, `bubbles`, `schools`, `.node`, `.spot`, `shellArt`/`wreckArt`/`caveArt`/`vaultArt`, `.reward`) · **3-bosqich rejasi (namuna va qoidalar manbai):** `docs/superpowers/plans/2026-10-26-lernen-ormon-tema.md`.

> **Qamrov:** spec §12 ning faqat **4-bosqichi**. «Nemis sayohati» (5-bosqich), yo'ldagi unit qatori va daraja ajratgichining tema ko'rinishi, tugunlarni bog'lovchi lenta KIRMAYDI. Server o'zgarishi va migratsiya YO'Q (`dengiz` id'si server ro'yxatida allaqachon bor). Sahifalar (`lernen-levels-page.tsx`, `lernen-unit-page.tsx`, `yol/*`) O'ZGARMAYDI — faqat ularning testlariga Dengiz bloklari qo'shiladi.

## Global Constraints

3-bosqich qoidalari (ADR-0132) va CEO qarorlaridan; har task uchun majburiy:

- **Ish joyi:** worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/lernen-dizayn`, shox `feat/lernen-dengiz-tema` (origin/main'dan). Bash buyruqlari shu papkadan (`cd client && …` shu papkaga nisbatan); worktree'dan tashqariga `cd` QILINMAYDI. `client/node_modules` yo'q bo'lsa — `cd client && npm install` (bir marta).
- **Server o'zgarmaydi:** `server/` ga va Prisma sxemasiga tegilmaydi. Biror task server o'zgarishini talab qilsa — to'xtab, nazoratchiga aytiladi («To'xtash shartlari»).
- **Mantiq tegilmaydi:** `lernen/seans-navbat.ts`, `lernen/fortschritt.ts`, `lernen/yol/yol-tuzilishi.ts`, `lernen/yol/yopishqoq-unit-lavha.tsx` o'zgarmaydi; `yopishqoq-unit-lavha.tsx` `tema/` dan HECH QACHON import qilmaydi (`DARAJA_FONI` qiymat tsikli). `gsap` faqat `dafi/dafi.tsx` ichidagi `import("gsap")`.
- **«Toza» va «O'rmon» o'zgarmaydi:** ikkalasining chizgan markup'i bayt-ma-bayt bir xil qoladi (Task 1 dagi refaktor oltin-nusxa testi bilan isbotlanadi). Mavjud testlar (`toza-*.test.ts`, `ormon-*.test.ts`, `lernen-unit-page.test.ts`, `lernen-levels-page.test.ts`, `yopishqoq-unit-lavha.test.ts`, `student-portal-load-states.test.ts`, `globals-css.test.ts` ning O'rmon bloklari) kutilmalari o'zgartirilmasdan yashil qoladi; faqat yangi `describe`/`it` qo'shiladi. Istisno — tanlov ro'yxatini qotirgan testlar (`lernen-temalar.test.ts`, `lernen-tema-rasmi.test.ts` dagi «tayyor emas» misoli): ular rejadagi aniq Edit bilan yangilanadi. `globals-css.test.ts` dagi skaner funksiyalari parametrlanadi (nomi o'zgaradi), O'rmon kutilmalari esa so'zma-so'z qoladi.
- **Tema faqat chizadi (ADR-0125, ADR-0128):** xato javob yumshoq (amber), ovozlar, konfeti va Dafi qarorlari temaga bog'liq emas. Tugun/joy bosilganda ovozni chaqiruvchi (sahifa) chaladi.
- **Sahna qoidalari (ADR-0132, 4–6-bandlar, Dengizga ham majburiy):**
  - Sahnani sahifa `SahnaRamka` ichida chizadi (mavjud simlar; Dengiz faqat `Sahna` komponentini beradi). Sahna ildizi `data-sahna="dengiz"` — shisha va overlay xiraligini o'chiruvchi mavjud qoidalar unga ham tegadi; yangi `data-sahna` selektori yozilmaydi.
  - Animatsiya faqat `transform` va `opacity` (`globals-css.test.ts`). Rang/`fill`/`filter`/`box-shadow`/`background` animatsiya qilinmaydi.
  - **Dengizda CSS `filter` umuman yo'q** (na harakatlanuvchi, na qotgan elementda; joy belgisining `grayscale` sinfi — kartadagi qotgan kichik SVG, umumiy `SahnaJoy` dan, bundan mustasno). SVG `filter`/`feGaussianBlur`/`feTurbulence` ham yo'q, `mix-blend-mode` yo'q, `backdrop-filter` yo'q.
  - Yagona harakatlanuvchi qatlam — har zonadagi ikki tor (`STRIP_WIDTH` = 96 px) qoya tasmasi (`data-omil`, `WALL_FACTOR` = 0.35), 640 px plitka + `<use>` nusxalari (`TILE`, `TILE_COPIES`); `will-change: transform` faqat ko'rinayotgan zonaning tasmalarida va «Kam harakat»/tizim sozlamasida qaytarib olinadi.
  - Zona almashinuvi — `opacity` almashuvi; ko'rinmayotgan zona `visibility: hidden`, ichidagi animatsiya to'xtagan.
  - Bitta sahnada ≤ 300 DOM/SVG element (`ELEMENT_BUDGET`; spec chegarasi 1500 — Dengiz uning beshdan biriga quriladi).
  - Filtr/plitka/gradient `id`'lari (zona, tomon) bo'yicha — hujjatda bitta sahna; `Miniatyura` o'z statik SVG'ini chizadi, sahna komponentlarini qayta ishlatmaydi.
  - Qorong'u rejim: bitta statik parda (`DARK_VEIL`, `hidden dark:block`).
- **Kontrast:** sahifaning umumiy matni mavjud pardalarda (`SAHNA_PARDASI`, `SAHNA_PARDASI_KICHIK`, `SAHNA_KARTASI`; sahifalar allaqachon «sahnali tema» shartida qo'yadi). Dengizning o'z matni ≥ 4.5:1, ikonalari ≥ 3:1 — `dengiz-kontrast.test.ts` `globals.css` dagi haqiqiy tokenlardan (`test-support/hex-contrast.ts`), yorug' va qorong'u rejimda hisoblaydi.
- **`globals.css`:** har `.dengiz-*` qoidasi `.lumio` bilan boshlanadi; izoh deklaratsiya ichida EMAS, qoidadan yuqorida (Lightning CSS butun `@layer` ni tashlaydi); `backdrop-filter: none` yozilsa — prefiksli e'lon BIRINCHI (bu rejada yozilmaydi). Yangi o'zgaruvchilar (`--dengiz-*`) faqat `.lumio` va `.dark .lumio` bloklarida; global `@theme` ga yangi nom qo'shilmaydi.
- **i18n:** ekrandagi hamma yangi matn o'zbek (lotin), inglizcha so'z yo'q. Yagona yangi kalit: `"{n} m"` (ru `"{n} м"`, de/en `"{n} m"`), lug'atlarda `};\n\nexport default xx;` dan OLDIN. `t("…")` bor har yangi fayl `client/src/i18n/i18n-coverage.test.ts` dagi `STRICT_FILES` ga. Ma'lumot (`label`, `matn`, `titleDe`, `titleUz`) `t()` ga hech qachon berilmaydi; raqam (`n`) — o'rinbosar.
- **Nomlash:** shartnoma o'rinlari va tema komponentlari o'zbekcha (`DengizTugun`, `DengizJoy`, `SharTugun`), sof yordamchilar, ma'lumot va CSS sinflari inglizcha (`zoneForUnit`, `dengizPlan`, `.dengiz-strip`), zona va joy id'lari o'zbekcha (`marjon`, `kelp`, `chuqur`; `chiganoq`, `kema`, `gor`, `xazina`). Kod izohlari va commit xabarlari INGLIZCHA.
- **Tahrir usuli:** mavjud fayllarda faqat rejadagi aniq old→new Edit'lar; «butun fayl (Write)» deyilgan joyda avval faylni Read qiling, keyin rejadagi matnni to'liq yozing.
- **Format:** `client/` da Prettier ISHLATILMAYDI. Yangi fayl ≤ 500 qator. Har commit oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Testlar:** `cd client && npx vitest run <yo'l>` (agar `configLoader` xatosi chiqsa: `npx vitest --config vitest.config.mts run <yo'l>`). DOM'siz: hook/effekt testlanmaydi — sof funksiya va statik markup; zustand holatini statik renderdan oldin o'rnatib bo'lmaydi; brauzerdagina ko'rinadigan narsa Task 9 ro'yxatida. Kod o'zgarmasdan bir xil buyruqni qayta yugurtirmang. `npx next build` testlar bilan PARALLEL ishlatilmaydi.

## Qarorlar

1. **Zona — unitning darajadagi tartibidan:** `zoneForUnit(order)` = marjon, kelp, chuqur, yana marjon… (`(order − 1) mod 3`, O'rmon bilan bitta `unitCycleIndex`). Yo'lda sahna ko'rinayotgan unitga mavjud `BIOME_SETTLE_MS` (250 ms) bilan ergashadi, unit sahifasida zona `data.order` dan qotgan — ikkalasi sahifalarda allaqachon bor (`unitTartibi`), kod o'zgarmaydi. Sabab: qo'shimcha so'rov yo'q, ikki ekran bir zonani ko'rsatadi; har unit — bitta sho'ng'ish bosqichi.
2. **Chuqurlik — zona bosqichi, jonli o'lchagich emas:** mockupdagi skrollga ergashuvchi «3 m → 85 m» o'lchagichi qurilmaydi (har kadr matn yozish = layout + paint, va yo'l ustidagi qotgan element uchun shartnomada o'rin yo'q). Zona chuqurligi unit lavhasida qotgan belgi: «5 m», «25 m», «70 m» (mockup `.ban .dep`), `t("{n} m", { n })`, `aria-hidden`, lavhaning shaffof bo'lmagan rangi ustida (oq matn ≥ 4.5:1). Sabab: «skroll = chuqurlik» zonalar almashinuvi bilan beriladi, narxi nol.
3. **Sahna tuzilishi va byudjet:** har zona = qotgan suv gradienti + qotgan tog' tizmalari (filtrsiz SVG) + **yagona harakatlanuvchi qatlam** — chetlardagi ikki tor qoya tasmasi (96 px, `WALL_FACTOR` 0.35, marjon/yelpig'ich, kelp yoki nurli naychalar) + pastki burchaklarda ikki tebranuvchi o'simlik; zonalar ustida umumiy ambient: bitta nur qatlami, pufakchalar, baliq to'dalari. To'liq: bezak 4/tasma, tebranish 2, pufakcha 8, to'da 2, parallaks; yengil: 2/0/4/1, parallaks; kam harakat: pufakcha va to'da yo'q, parallaks yo'q, nur va tebranish qotgan. `ELEMENT_BUDGET` = 300 (amalda ~230). Sabab: 3-bosqichda narx uchta to'liq ekranli xira qatlamning parallaksida edi (~8 ekran qatlam ustma-ust); Dengizda ~2 ekran.
4. **Unumdorlik o'lchanadi (Task 8):** Playwright + CDP `Emulation.setCPUThrottlingRate = 4`, 4 s skroll tsikli, rAF kadr vaqtlari p50/p95 — Toza, O'rmon, Dengiz × to'liq/yengil/kam harakat. Qabul chegarasi: Dengiz to'liq p50 ≤ 20 ms va ≤ 0.7 × O'rmon to'liq p50, p95 < O'rmon p95; Dengiz yengil va kam harakat p50 ≤ 1.1 × Toza (xuddi shu rejim). O'tmasa — `dengizPlan` sonlaridagi tartiblangan «tugmalar» (Task 8).
5. **O'rmondan umumiy qismlar ajratiladi, nusxa olinmaydi:** `tema/sahna-umumiy.ts` (`unitCycleIndex`, `seededRandom`/`between`/`r1`, `TILE`, `TILE_COPIES`, `CARD_SURFACE_ALPHA`, `joyTanla`) va `tema/sahna-qismlari.tsx` (`SharTugun`, `SahnaJoy`, `SahnaMukofotFoni` — tema id'si `<id>-ring`, `<id>-bob`, `<id>-burst` sinflari va `--<id>-mukofot-*` tokenlarini nomlaydi). O'rmon fayllari ingichka o'ramga aylanadi, markup bayt-ma-bayt bir xil (oltin-nusxa testi), O'rmon testlari o'zgarmaydi. Sabab: qulf semantikasi, chap-o'ng almashinuv, nishon chetidagi joy, «faqat bezak qatlami kesiladi» kabi ko'rik tuzatishlari bir joyda yashaydi; 5-bosqich ham shuni oladi.
6. **Temaga xos qolgani — Dengizning o'z sof funksiyalari:** palitra (`ZONES`), `dengizPlan`, `stripShapes`/`wallPoints`/`decorSpecs`/`bubbleSpecs`/`schoolSpecs`. Sabab: tarkib boshqa (daraxt/tepalik emas, qoya devori/bezak/pufakcha/baliq) — `scenePlan`/`layerShapes` ni umumlashtirish hech narsa tejamaydi. `useKamHarakat` + `useYengilRejim` + `useSahnaPauza` + `useParallaks` simi (10 qator) har sahnada o'z faylida qoladi: mantiq hook'larda, ular qayta ishlatiladi.
7. **Noma'lum dars turi xavfsiz:** `joyTanla(kind, joylar)` — `joylar: Record<DafLessonKind, J>` (yangi tur qo'shilsa kompilyatsiya to'xtaydi: «exhaustive»), ishlash vaqtida noma'lum tur (server va klient alohida deploy) yoki `null` (eski DiB darsi) — `SECTION_A` joyi (chig'anoq uyi); faqat o'z kaliti tekshiriladi (`"constructor"` kabi qiymat ham yiqitmaydi).
8. **Dengiz ko'rinishi mockupdan:** tugun — marvarid (bajarilgan), oltin (joriy, `.dengiz-ring` halqasi; kam harakatda halqa yo'q, lekin oltin rang va yulduz o'zi ajratadi), xira tosh (qulf, O'rmon bilan bir xil); joylar — chig'anoq uyi (Tanishuv, eski darslar), kema (Ishlatish), g'or (O'tish sinovi), xazina (Yakuniy sinov); qulflangani qorong'ulikda (to'q ko'k radial + kulrang belgi); urg'u — chuqur dengiz ko'ki `#0b5f86` (oq 7.0:1); mukofot — tiniq sayoz suv va qum (`--dengiz-*`), bayramda sekin aylanuvchi nur. Belgilar qo'lda chizilgan kichik SVG (≤ 10 element), holat ikonalari `@phosphor-icons/react`.
9. **Tanlash:** `dengiz` — `tayyor: true`; karta `DengizMiniatyura` ni (o'z statik SVG'i, `id="dengiz-miniatyura-suv"`) chizadi; dialog misollari reyestrdan avtomatik. «Tez orada» endi faqat «Nemis sayohati». Server ro'yxati o'zgarmaydi.
10. **Ataylab qilinmaydi (YAGNI):** jonli chuqurlik o'lchagichi, sirt to'lqinlari, kaustika (`feTurbulence`), meduzalar, plankton, qisqichbaqa, zona nomlari lavhada, tugunlarni bog'lovchi lenta, pufakcha «parda» o'tishi, xazina sandig'i animatsiyasi, Dengizni alohida chunk'ka bo'lish.

## To'xtash shartlari

- Biror qadam server, Prisma, sahifalar (`lernen-levels-page.tsx`, `lernen-unit-page.tsx`, `yol/*`) yoki `yol-tuzilishi.ts`/`fortschritt.ts`/`seans-navbat.ts` o'zgarishini talab qilsa — to'xtang va nazoratchiga yozing.
- Task 1 dan keyin O'rmon oltin-nusxa testi yoki mavjud O'rmon/Toza testi o'zgartirilmasdan yashil bo'lmasa — testni moslashtirmang, to'xtang: bu O'rmon/Toza markup'i o'zgargani.
- Task 8 dagi hamma tugma qo'llangandan keyin ham qabul chegarasi bajarilmasa — to'xtang, o'lchov jadvalini nazoratchiga bering (sahna tuzilishi qayta hal qilinadi).
- Brauzer tekshiruvida (Task 9) sahna biror qatlamni (pastki varaq, yopishqoq lavha, Dafi, radio) yopsa — to'xtang.

## File Structure

**Yangi — umumiy** (`client/src/components/student-portal/lernen/tema/`):
- `sahna-umumiy.ts` — sof: `unitCycleIndex`, `seededRandom`, `between`, `r1`, `TILE`, `TILE_COPIES`, `CARD_SURFACE_ALPHA`, `joyTanla`.
- `sahna-qismlari.tsx` — `SharTugun`, `SahnaJoy`, `SahnaMukofotFoni` (+ turlar `SahnaTemaId`, `SharRangi`, `JoyKorinishi`, `BelgiProps`).
- `sahna-umumiy.test.ts` — ikkala modulning testi.

**Yangi — Dengiz** (`…/tema/dengiz/`):
- `dengiz-zona.ts` — `ZONE_IDS`, `ZONES`, `zoneForUnit`, `TUBE_STEM`, `ZONE_DEPTH_M`, `DEPTH_CHIP_ALPHA`, `DARK_VEIL`, `ACCENT`.
- `dengiz-reja.ts` — `WALL_FACTOR`, `STRIP_WIDTH`, `WALL_STEP`, `ELEMENT_BUDGET`, `dengizPlan`, `ZONE_DECOR`, `SWAY_DECOR`, `wallPoints`, `wallPath`, `decorSpecs`, `stripShapes`, `bubbleSpecs`, `schoolSpecs`, `SCHOOL_FISH`.
- `dengiz-reja.test.ts` — zona, reja, shakllar, plitka choki.
- `dengiz-bezak.tsx` — `DECOR_GLYPH`, `GLYPH_BOX`, `Baliq`, `DengizDevor` (qoya tasmasi).
- `dengiz-sahna.tsx` (+`dengiz-sahna.test.ts`) — `DengizSahnaChizma`, `DengizSahna`.
- `dengiz-tugun.tsx` — `SHAR`, `DengizTugun`.
- `dengiz-joy.tsx` — joy belgilari, `placeForKind`, `NISHON`, `DengizJoy`.
- `dengiz-unit-lavha.tsx` — `DengizUnitLavha`.
- `dengiz-orinlar.test.ts` — tugun, joy, lavha.
- `dengiz-tema.tsx` (+`dengiz-tema.test.ts`) — `DengizMukofotFoni`, `DengizMiniatyura`, `dengizTema`.
- `dengiz-kontrast.test.ts`.

**O'zgaradi:**
- O'rmon (faqat o'ramga aylanadi, markup bir xil): `tema/ormon/ormon-biom.ts`, `ormon-sahna-rejasi.ts`, `ormon-shakllar.ts`, `ormon-qatlam.tsx`, `ormon-joy-belgilari.tsx`, `ormon-tugun.tsx`, `ormon-joy.tsx`, `ormon-mukofot-foni.tsx`.
- `tema/tema-reyestri.ts` (+test), `client/src/lib/lernen-temalar.ts` (+test), `client/src/components/student-portal/lernen-tema-rasmi.test.ts`.
- `lernen/lernen-levels-page.test.ts`, `lernen/lernen-unit-page.test.ts` (faqat yangi bloklar).
- `client/src/app/globals.css` (+`globals-css.test.ts`), `client/src/i18n/i18n-coverage.test.ts`, `client/src/i18n/dictionaries/{ru,de,en}.ts`.

**Hujjatlar:** `docs/adr/0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md`, `docs/adr/README.md`, `client/CLAUDE.md`.

**Repoga kirmaydi:** o'lchov skripti `lernen-sahna-olchov.mjs` (bajaruvchining scratchpad papkasida, Task 8).

Yo'l qisqartmasi: quyida `L/` = `client/src/components/student-portal/lernen/`, `T/` = `L/tema/`, `O/` = `L/tema/ormon/`, `D/` = `L/tema/dengiz/`.

---

### Task 1: Client — O'rmondan umumiy sahna qismlari (`sahna-umumiy.ts`, `sahna-qismlari.tsx`), O'rmon markup'i o'zgarmaydi

**Files:**
- Create: `T/sahna-umumiy.ts`, `T/sahna-qismlari.tsx`, `T/sahna-umumiy.test.ts`
- Modify: `O/ormon-biom.ts`, `O/ormon-sahna-rejasi.ts`, `O/ormon-shakllar.ts`, `O/ormon-qatlam.tsx`, `O/ormon-joy-belgilari.tsx`
- Modify (butun fayl, Write): `O/ormon-tugun.tsx`, `O/ormon-joy.tsx`, `O/ormon-mukofot-foni.tsx`
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`)
- Temporary (commit QILINMAYDI): `O/ormon-oltin.tmp.test.ts` va uning `O/__snapshots__/`

**Interfaces:**
- Consumes: `TugunBelgisiProps`, `TugunHolat`, `UnitJoyiProps`, `MukofotFoniProps` (`T/tema-turlari.ts`); `LernenTemaId` (`@/lib/lernen-temalar`); `DafLessonKind` (`L/types.ts`); `useT` (`@/i18n/use-t`); `cn` (`@/lib/utils`).
- Produces (keyingi tasklar shularga tayanadi):
  - `T/sahna-umumiy.ts`: `TILE = 640`, `TILE_COPIES = 4`, `CARD_SURFACE_ALPHA = 0.9`, `unitCycleIndex(unitOrder: number, length: number): number`, `seededRandom(seed: number): () => number`, `between(rnd: () => number, a: number, b: number): number`, `r1(n: number): number`, `joyTanla<J extends string>(kind: DafLessonKind | null, joylar: Record<DafLessonKind, J>): J`.
  - `T/sahna-qismlari.tsx`: `type SahnaTemaId = Exclude<LernenTemaId, "toza">`; `interface SharRangi { fon: string; soya: string; belgi: string }`; `SharTugun(props: TugunBelgisiProps & { tema: SahnaTemaId; shar: Record<TugunHolat, SharRangi>; halqa: string })`; `interface BelgiProps { className?: string }`; `interface JoyKorinishi { nur: Record<TugunHolat, string>; nishon: Record<TugunHolat, { fon: string; rang: string }>; tuman: string; accent: string; faolNur: string }`; `SahnaJoy(props: UnitJoyiProps & { tema: SahnaTemaId; joy: string; Belgi: (p: BelgiProps) => React.JSX.Element; korinish: JoyKorinishi })`; `SahnaMukofotFoni(props: MukofotFoniProps & { tema: SahnaTemaId })`.
  - O'rmon eksportlari o'zgarmaydi (`SHAR`, `NISHON`, `placeForKind`, `seededRandom`, `TILE`, `CARD_SURFACE_ALPHA`, `biomeForUnit` — o'sha nom va qiymatlar).

- [ ] **Step 1: Check the branch**

Run: `git branch --show-current`
Expected: `feat/lernen-dengiz-tema`.

- [ ] **Step 2: Record O'rmon's markup before the move (temporary golden test)**

`O/ormon-oltin.tmp.test.ts` (vaqtinchalik, Step 12 da o'chiriladi):

```ts
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { biomeForUnit } from "./ormon-biom";
import { placeForKind } from "./ormon-joy-belgilari";
import { OrmonJoy } from "./ormon-joy";
import { OrmonMukofotFoni } from "./ormon-mukofot-foni";
import { OrmonSahnaChizma } from "./ormon-sahna";
import { scenePlan } from "./ormon-sahna-rejasi";
import { OrmonTugun } from "./ormon-tugun";

// TEMPORARY (Task 1 only, never committed): O'rmon's markup before and after
// its pieces move to the shared modules must be byte-identical.
const HOLATLAR: TugunHolat[] = ["done", "active", "locked"];
const KINDS: UnitJoyiProps["kind"][] = ["SECTION_A", "SECTION_B", "BRIDGE", "UNIT_TEST", null];
const noop = () => {};

describe("O'rmon golden markup", () => {
  it("the node in every state", () => {
    expect(
      HOLATLAR.map((holat) =>
        renderToStaticMarkup(
          createElement(OrmonTugun, { label: "Tanishuv", holat, tone: "coral", onClick: noop, onBosilmagan: noop }),
        ),
      ),
    ).toMatchSnapshot();
  });

  it("every place, state and side", () => {
    expect(
      KINDS.flatMap((kind) =>
        HOLATLAR.flatMap((holat) =>
          [0, 1].map((tartib) =>
            renderToStaticMarkup(
              createElement(OrmonJoy, {
                label: "Tanishuv",
                kind,
                holat,
                tone: "coral",
                izoh: holat === "done" ? "Yana mashq qilish · 14 yangi so'z" : null,
                tartib,
                onClick: noop,
                onBosilmagan: noop,
              }),
            ),
          ),
        ),
      ),
    ).toMatchSnapshot();
  });

  it("the reward, with and without a celebration", () => {
    expect(
      [false, true].map((bayram) =>
        renderToStaticMarkup(
          createElement(OrmonMukofotFoni, { bayram } as ComponentProps<typeof OrmonMukofotFoni>, "Dars tugadi!"),
        ),
      ),
    ).toMatchSnapshot();
  });

  it("the scene in every plan and biome", () => {
    const plans = [
      { reduced: false, light: false },
      { reduced: false, light: true },
      { reduced: true, light: false },
    ];
    expect(
      plans.flatMap((p) =>
        [1, 2, 3].map((unitTartibi) =>
          renderToStaticMarkup(createElement(OrmonSahnaChizma, { unitTartibi, plan: scenePlan(p), kam: p.reduced, tinch: false })),
        ),
      ),
    ).toMatchSnapshot();
  });

  it("the pure mappings, unknown inputs included", () => {
    expect([0, -1, 1.7, Number.NaN, 4].map(biomeForUnit)).toMatchSnapshot();
    expect(["FUTURE_KIND", "constructor"].map((k) => placeForKind(k as never))).toMatchSnapshot();
  });
});
```

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-oltin.tmp.test.ts -u`
Expected: PASS, `5 passed`; `O/__snapshots__/ormon-oltin.tmp.test.ts.snap` yoziladi (bu — refaktordan OLDINGI holat).

- [ ] **Step 3: Write the failing tests for the shared parts**

`T/sahna-umumiy.test.ts`:

```ts
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunHolat } from "./tema-turlari";
import { type JoyKorinishi, SahnaJoy, SahnaMukofotFoni, type SharRangi, SharTugun } from "./sahna-qismlari";
import { CARD_SURFACE_ALPHA, TILE, TILE_COPIES, joyTanla, seededRandom, unitCycleIndex } from "./sahna-umumiy";

describe("unitCycleIndex (spec §5 palitraUnitga, shared by every scene)", () => {
  it("walks the stages by the unit's order in its level and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((n) => unitCycleIndex(n, 3))).toEqual([0, 1, 2, 0, 1, 2, 2]);
    expect([1, 2, 3, 4, 5].map((n) => unitCycleIndex(n, 4))).toEqual([0, 1, 2, 3, 0]);
  });

  it("gives an exact stage for an order the data should never hold", () => {
    expect(unitCycleIndex(0, 3)).toBe(2);
    expect(unitCycleIndex(-1, 3)).toBe(1);
    expect(unitCycleIndex(-5, 3)).toBe(0);
    expect(unitCycleIndex(1.7, 3)).toBe(0);
    expect(unitCycleIndex(Number.NaN, 3)).toBe(0);
    expect(unitCycleIndex(Number.POSITIVE_INFINITY, 3)).toBe(0);
  });
});

describe("seededRandom", () => {
  it("gives the same numbers in [0, 1) for the same seed, so the server and the browser draw the same scene", () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const xs = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("the wrapping tile", () => {
  it("covers a viewport up to 1920 px tall: the copies reach the viewport plus one tile", () => {
    expect((TILE_COPIES - 1) * TILE).toBeGreaterThanOrEqual(1920);
  });
});

describe("joyTanla", () => {
  const JOYLAR = { SECTION_A: "a", SECTION_B: "b", BRIDGE: "c", UNIT_TEST: "d" } as const;

  it("names each step's place; an old DiB lesson is the first meeting's place", () => {
    expect(joyTanla("SECTION_A", JOYLAR)).toBe("a");
    expect(joyTanla("SECTION_B", JOYLAR)).toBe("b");
    expect(joyTanla("BRIDGE", JOYLAR)).toBe("c");
    expect(joyTanla("UNIT_TEST", JOYLAR)).toBe("d");
    expect(joyTanla(null, JOYLAR)).toBe("a");
  });

  // The client and the server are deployed by hand: the server can send a kind
  // this build does not know. The page must still draw a place, never throw.
  it("draws a kind this build does not know as the first meeting's place, even one named like an object key", () => {
    for (const k of ["FUTURE_KIND", "constructor", "toString", "__proto__", ""]) {
      expect(joyTanla(k as unknown as Parameters<typeof joyTanla>[0], JOYLAR), k).toBe("a");
    }
  });
});

describe("the shared parts take the theme's id for their classes and tokens", () => {
  const noop = () => {};
  const SHAR: Record<TugunHolat, SharRangi> = {
    done: { fon: "#fff6d4", soya: "none", belgi: "#6b4a10" },
    active: { fon: "#86ead2", soya: "none", belgi: "#0d4a3d" },
    locked: { fon: "#ffffff", soya: "none", belgi: "#45616f" },
  };
  const tugun = (holat: TugunHolat) =>
    renderToStaticMarkup(
      createElement(SharTugun, {
        tema: "dengiz",
        shar: SHAR,
        halqa: "0 0 0 10px red",
        label: "Tanishuv",
        holat,
        tone: "coral",
        onClick: noop,
        onBosilmagan: noop,
      }),
    );

  it("SharTugun: the theme's node and ring; a locked node stays a button that says it is closed", () => {
    const html = tugun("active");
    expect(html).toContain('data-tugun="dengiz"');
    expect(html).toContain('class="dengiz-ring absolute inset-0 rounded-full"');
    expect(html).toContain("box-shadow:0 0 0 10px red");
    const locked = tugun("locked");
    expect(locked).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(locked).toContain('aria-disabled="true"');
    expect(locked).not.toMatch(/<button[^>]*\sdisabled/);
    expect(locked).not.toContain("dengiz-ring");
  });

  const KORINISH: JoyKorinishi = {
    nur: { done: "gold", active: "mint", locked: "white" },
    nishon: {
      done: { fon: "#f2cd7a", rang: "#5a3d10" },
      active: { fon: "#86ead2", rang: "#0d4a3d" },
      locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
    },
    tuman: "navy",
    accent: "#0b5f86",
    faolNur: "0 0 40px gold",
  };
  const Belgi = ({ className }: { className?: string }) => createElement("svg", { className, "aria-hidden": "true" });
  const joy = (holat: TugunHolat, tartib = 0) =>
    renderToStaticMarkup(
      createElement(SahnaJoy, {
        tema: "dengiz",
        joy: "kema",
        Belgi,
        korinish: KORINISH,
        label: "Ishlatish",
        kind: "SECTION_B",
        holat,
        tone: "coral",
        izoh: null,
        tartib,
        onClick: noop,
        onBosilmagan: noop,
      }),
    );

  it("SahnaJoy: the place's id, the theme's breathing class, the accent ring and the surface share the contrast tests measure", () => {
    const html = joy("active");
    expect(html).toContain('data-joy="kema"');
    expect(html).toContain('class="relative size-16 dengiz-bob"');
    expect(html).toContain("box-shadow:0 0 0 2px #0b5f86, 0 0 40px gold");
    expect(html).toContain(`style="background:#0b5f86">Boshlash<`);
    expect(html).toContain(`bg-surface/${Math.round(CARD_SURFACE_ALPHA * 100)}`);
    expect(html).not.toContain("backdrop-");
    expect(joy("locked")).toContain("data-tuman");
    expect(joy("locked", 1)).toContain("flex-row-reverse");
  });

  it("SahnaMukofotFoni: the theme's tokens, its sunburst only for a celebration", () => {
    const foni = (bayram: boolean) =>
      renderToStaticMarkup(
        createElement(SahnaMukofotFoni, { tema: "alp", bayram } as ComponentProps<typeof SahnaMukofotFoni>, "Dars tugadi!"),
      );
    expect(foni(false)).toContain('data-mukofot="alp"');
    expect(foni(false)).toContain("var(--alp-mukofot-ust)");
    expect(foni(false)).toContain("var(--alp-tepalik)");
    expect(foni(false)).not.toContain("alp-burst");
    expect(foni(true)).toContain("alp-burst");
    expect(foni(true)).toContain("var(--alp-mukofot-nur)");
    expect(foni(true)).toContain("Dars tugadi!");
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/sahna-umumiy.test.ts`
Expected: FAIL — `Failed to resolve import "./sahna-qismlari"` (modullar yo'q).

- [ ] **Step 5: Write the shared pure helpers**

`T/sahna-umumiy.ts`:

```ts
import type { DafLessonKind } from "../types";

// Pure helpers every scene theme shares (ADR-0132, ADR-0133). They came out of
// «O'rmon» unchanged; «Dengiz» and any later scene take them from here.

/** Height (px) of one tile of a scene layer: the layer repeats it and wraps, so the DOM never grows with the path. */
export const TILE = 640;

/**
 * How many times a layer draws its tile (the tile itself plus
 * `TILE_COPIES - 1` `<use>` copies). The layer is the screen plus one tile tall
 * and its scroll offset wraps in (-TILE, 0], so the copies must reach
 * viewport + TILE: they cover viewports up to (TILE_COPIES - 1) * TILE = 1920 px.
 */
export const TILE_COPIES = 4;

/** A place card over a scene is `bg-surface/90` (`SahnaJoy`); the contrast tests read this share. */
export const CARD_SURFACE_ALPHA = 0.9;

/**
 * Spec §5 `palitraUnitga`: the stage (0-based, of `length`) of a unit by its
 * order in its level — 1 → 0, 2 → 1, … — starting over after `length`. An
 * order the data should never hold still gets one exact stage: the walk
 * continues backwards below 1, a fraction is cut, and a number that is not a
 * number is the first unit.
 */
export function unitCycleIndex(unitOrder: number, length: number): number {
  const n = Number.isFinite(unitOrder) ? Math.trunc(unitOrder) : 1;
  return (((n - 1) % length) + length) % length;
}

/**
 * Seeded random numbers (mulberry32, the mockups' `RNG`): the server and the
 * browser draw the same scene, so hydration matches and nothing jumps.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number between `a` and `b` from a seeded stream. */
export const between = (rnd: () => number, a: number, b: number) => a + rnd() * (b - a);

/** Rounded to one decimal: short, stable markup. */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A lesson's place in a scene by its step (spec §8, ADR-0132). `joylar` names
 * a place for EVERY step, so a new `DafLessonKind` stops compiling until each
 * theme gives it one. An old DiB lesson (`null`) and a kind this build does
 * not know (the server and the client are deployed by hand, so they can
 * differ) are the first meeting's place: the page still draws. Only the map's
 * own keys count, so a value such as "constructor" falls back too.
 */
export function joyTanla<J extends string>(kind: DafLessonKind | null, joylar: Record<DafLessonKind, J>): J {
  return kind != null && Object.prototype.hasOwnProperty.call(joylar, kind) ? joylar[kind] : joylar.SECTION_A;
}
```

- [ ] **Step 6: Write the shared components**

`T/sahna-qismlari.tsx` (O'rmon'ning `OrmonTugun`, `OrmonJoy`, `OrmonMukofotFoni` JSX'i so'zma-so'z; faqat literal'lar parametrga aylandi):

```tsx
"use client";

import type * as React from "react";
import { Check, LockSimple, Play, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { MukofotFoniProps, TugunBelgisiProps, TugunHolat, UnitJoyiProps } from "./tema-turlari";

/**
 * A theme that stands a scene (ADR-0132, ADR-0133). Its id names its CSS
 * classes (`<id>-ring`, `<id>-bob`, `<id>-burst` in globals.css) and its reward
 * tokens (`--<id>-mukofot-ust`, `--<id>-mukofot-ost`, `--<id>-mukofot-nur`,
 * `--<id>-tepalik` in `.lumio` and `.dark .lumio`).
 */
export type SahnaTemaId = Exclude<LernenTemaId, "toza">;

/** An orb's look in one state: its fill, its shadow and glow, its glyph's colour. */
export interface SharRangi {
  fon: string;
  soya: string;
  belgi: string;
}

export interface SharTugunProps extends TugunBelgisiProps {
  tema: SahnaTemaId;
  shar: Record<TugunHolat, SharRangi>;
  /** The current node's ring (a `box-shadow`); it breathes through the theme's `<id>-ring` class. */
  halqa: string;
}

/**
 * A scene theme's path node: an orb per state, the current one wearing a
 * breathing ring (transform and opacity only). A locked node is still a button
 * — the student gets the soft "locked" answer — but it says it is closed to
 * screen readers. The name sits on a plain surface pill, positioned so it
 * paints above the ring, readable over any part of the scene.
 *
 * Under «Kam harakat» the ring rests at `opacity: 0`, so the current node must
 * not lean on it: each theme's `shar` gives it its own fill and glow, and the
 * star glyph tells it apart from the check and the lock.
 */
export function SharTugun({ tema, shar, halqa, label, holat, onClick, onBosilmagan }: SharTugunProps) {
  const t = useT();
  const locked = holat === "locked";
  const rang = shar[holat];
  const Icon = holat === "done" ? Check : holat === "active" ? Star : LockSimple;
  return (
    <div data-tugun={tema} className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span aria-hidden className={`${tema}-ring absolute inset-0 rounded-full`} style={{ boxShadow: halqa }} />
        ) : null}
        <button
          type="button"
          onClick={locked ? onBosilmagan : onClick}
          aria-label={locked ? t("{label} — hali ochilmagan", { label }) : label}
          aria-disabled={locked || undefined}
          className={cn(
            "relative grid size-[68px] place-items-center rounded-full transition-transform",
            locked ? "cursor-default border border-white/60" : "hover:-translate-y-0.5 active:scale-95",
          )}
          style={{ background: rang.fon, boxShadow: rang.soya, color: rang.belgi }}
        >
          <Icon size={28} weight="fill" />
        </button>
      </div>
      <span className="relative max-w-[120px] truncate rounded-full bg-surface px-2.5 py-0.5 text-center text-xs font-bold text-ink-900 shadow-lumio-sm">
        {label}
      </span>
    </div>
  );
}

/** A place's emblem: a small, still SVG. */
export interface BelgiProps {
  className?: string;
}

/** A theme's look of its place cards. */
export interface JoyKorinishi {
  /** The light behind the emblem, per state. */
  nur: Record<TugunHolat, string>;
  /** The corner badge, per state (each theme's contrast test holds each pair to 3:1). */
  nishon: Record<TugunHolat, { fon: string; rang: string }>;
  /** What covers a locked place's emblem (fog, murk), without a backdrop blur. */
  tuman: string;
  /** The «Boshlash» pill and the current place's 2 px ring (white text 4.5:1 on it). */
  accent: string;
  /** The current place's glow outside the ring (a `box-shadow`). */
  faolNur: string;
}

export interface SahnaJoyProps extends UnitJoyiProps {
  tema: SahnaTemaId;
  /** The place's id (`data-joy`), from the theme's `placeForKind`. */
  joy: string;
  Belgi: (p: BelgiProps) => React.JSX.Element;
  korinish: JoyKorinishi;
}

/**
 * One lesson as a place in a scene (spec §8), alternating sides down the page.
 * The current place glows, its emblem breathes (`<id>-bob`) and it offers
 * «Boshlash»; a locked one is covered, stays a button (the short "locked"
 * sound) and tells screen readers it is closed. The card is a 90% surface
 * (`CARD_SURFACE_ALPHA`) with no backdrop blur: the scene moves under it on
 * every scroll frame.
 */
export function SahnaJoy({
  tema,
  joy,
  Belgi,
  korinish,
  label,
  holat,
  izoh,
  tartib,
  onClick,
  onBosilmagan,
}: SahnaJoyProps) {
  const t = useT();
  const qulf = holat === "locked";
  const joriy = holat === "active";
  const ongda = tartib % 2 === 1;
  const Nishon = holat === "done" ? Check : joriy ? Play : LockSimple;
  return (
    <button
      type="button"
      data-joy={joy}
      onClick={qulf ? onBosilmagan : onClick}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label }) : undefined}
      className={cn(
        "relative flex w-full items-center gap-4 rounded-[28px] bg-surface/90 px-5 py-4 text-left shadow-lumio-card transition-transform",
        ongda && "flex-row-reverse text-right",
        qulf ? "cursor-default" : "hover:-translate-y-0.5 active:translate-y-[3px]",
      )}
      style={joriy ? { boxShadow: `0 0 0 2px ${korinish.accent}, ${korinish.faolNur}` } : undefined}
    >
      <span aria-hidden className="relative grid size-20 shrink-0 place-items-center">
        <span className="absolute -inset-3 rounded-full" style={{ background: korinish.nur[holat] }} />
        <Belgi className={cn("relative size-16", joriy && `${tema}-bob`, qulf && "opacity-60 grayscale")} />
        {qulf ? (
          <span data-tuman="" className="absolute inset-0 rounded-full" style={{ background: korinish.tuman }} />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        {/* The corner badge (12px in, 28px wide) ends 40px from the card's edge, 20px into this column (the card pads 20px): 24px keeps a long name clear of it. */}
        <span
          className={cn(
            "block truncate font-display text-lg font-extrabold text-ink-900",
            ongda ? "pl-6" : "pr-6",
          )}
        >
          {label}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">{izoh}</span>
        ) : null}
        {joriy ? (
          <span
            className="mt-1.5 inline-block rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
            style={{ background: korinish.accent }}
          >
            {t("Boshlash")}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn("absolute top-3 grid size-7 place-items-center rounded-full", ongda ? "left-3" : "right-3")}
        style={{ background: korinish.nishon[holat].fon, color: korinish.nishon[holat].rang }}
      >
        <Nishon size={14} weight="bold" />
      </span>
    </button>
  );
}

/**
 * A scene theme's reward background (ADR-0128): the theme's light around the
 * reward, its ground at the bottom (`--<id>-tepalik`) and, for a celebration, a
 * slow sunburst (`<id>-burst`: rotation only, still under «Kam harakat»). The
 * colours are the theme's `.lumio` tokens, so the result's ink-900 heading and
 * ink-600 line keep 4.5:1. The sound, the confetti and Dafi are not the theme's.
 *
 * The 640 px sunburst is wider than the card, so the clip lives on a
 * decoration layer BEHIND the content. Nothing on the content path may clip:
 * Dafi's celebration hops lift it well above the card's top padding.
 */
export function SahnaMukofotFoni({ tema, bayram, children }: MukofotFoniProps & { tema: SahnaTemaId }) {
  return (
    <div data-mukofot={tema} className="relative px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
        style={{
          background: `radial-gradient(circle at 50% 30%, var(--${tema}-mukofot-ust), var(--${tema}-mukofot-ost) 75%)`,
        }}
      >
        {bayram ? (
          <div
            className={`${tema}-burst absolute size-[640px]`}
            style={{
              left: "calc(50% - 320px)",
              top: "calc(30% - 320px)",
              background: `repeating-conic-gradient(from 0deg, var(--${tema}-mukofot-nur) 0deg 10deg, transparent 10deg 30deg)`,
              maskImage: "radial-gradient(closest-side, #000, transparent)",
              WebkitMaskImage: "radial-gradient(closest-side, #000, transparent)",
            }}
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: `radial-gradient(ellipse at 50% 100%, var(--${tema}-tepalik), transparent 70%)` }}
        />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **Step 7: Run the shared tests**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/sahna-umumiy.test.ts`
Expected: PASS (barcha `it`).

- [ ] **Step 8: Move O'rmon onto the shared parts**

`O/ormon-biom.ts` — Old:

```ts
/** The «O'rmon» theme's three biomes (spec §8): dawn, lake, autumn. */
export const BIOME_IDS = ["tong", "kol", "kuz"] as const;
```

New:

```ts
import { unitCycleIndex } from "../sahna-umumiy";

/** The «O'rmon» theme's three biomes (spec §8): dawn, lake, autumn. */
export const BIOME_IDS = ["tong", "kol", "kuz"] as const;
```

Old:

```ts
/** The place cards' surface over the scene is `bg-surface/90` (the contrast test reads this). */
export const CARD_SURFACE_ALPHA = 0.9;
```

New:

```ts
// The place cards' surface over the scene is `bg-surface/90` (the contrast test reads this): the shared card's.
export { CARD_SURFACE_ALPHA } from "../sahna-umumiy";
```

Old:

```ts
export function biomeForUnit(unitOrder: number): BiomeId {
  const n = Number.isFinite(unitOrder) ? Math.trunc(unitOrder) : 1;
  return BIOME_IDS[(((n - 1) % 3) + 3) % 3];
}
```

New:

```ts
export function biomeForUnit(unitOrder: number): BiomeId {
  return BIOME_IDS[unitCycleIndex(unitOrder, BIOME_IDS.length)];
}
```

`O/ormon-sahna-rejasi.ts` — Old:

```ts
/** Height (px) of one tile of a layer: the layer repeats it and wraps, so the DOM never grows with the path. */
export const TILE = 640;
```

New:

```ts
// Height (px) of one tile of a layer: shared by every scene (`tema/sahna-umumiy.ts`).
export { TILE } from "../sahna-umumiy";
```

`O/ormon-shakllar.ts` — Old:

```ts
import { TILE, type LayerId } from "./ormon-sahna-rejasi";

/**
 * Seeded random numbers (mulberry32, the mockup's `RNG`): the server and the
 * browser draw the same forest, so hydration matches and nothing jumps.
 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rnd: () => number, a: number, b: number) => a + rnd() * (b - a);
const r1 = (n: number) => Math.round(n * 10) / 10;
```

New:

```ts
import { between, r1, seededRandom } from "../sahna-umumiy";
import { TILE, type LayerId } from "./ormon-sahna-rejasi";

// The seeded numbers are shared by every scene; re-exported for the forest's own users and tests.
export { seededRandom };
```

`O/ormon-qatlam.tsx` — Old:

```ts
import * as React from "react";
import { BIOMES, type BiomeId } from "./ormon-biom";
```

New:

```ts
import * as React from "react";
import { TILE_COPIES } from "../sahna-umumiy";
import { BIOMES, type BiomeId } from "./ormon-biom";
```

Old:

```ts
/**
 * How many times the tile is drawn down the layer (the tile itself plus
 * `TILE_COPIES - 1` `<use>` copies). The layer is the screen plus one tile tall
 * and its scroll offset wraps in (-TILE, 0], so the copies must reach
 * viewport + TILE: they cover viewports up to (TILE_COPIES - 1) * TILE = 1920 px.
 */
const TILE_COPIES = 4;

/** A soft tree drawn at its own origin (ormon2.html `soft`): a trunk and four round crowns. */
```

New:

```ts
/** A soft tree drawn at its own origin (ormon2.html `soft`): a trunk and four round crowns. */
```

`O/ormon-joy-belgilari.tsx` — Old:

```tsx
import type * as React from "react";
import type { DafLessonKind } from "../../types";

export type JoyId = "kulba" | "koprik" | "gor" | "qala";

/**
 * Which place a lesson is in the forest (spec §8): the first meeting in a hut,
 * the practice on a bridge, the passage test in a cave, the final test in a
 * castle. An old DiB lesson has no step: it is a hut.
 */
export function placeForKind(kind: DafLessonKind | null): JoyId {
  switch (kind) {
    case "SECTION_A":
    case null:
      return "kulba";
    case "SECTION_B":
      return "koprik";
    case "BRIDGE":
      return "gor";
    case "UNIT_TEST":
      return "qala";
    default: {
      // A new lesson kind must get its own place: this line stops compiling until it does.
      const unplaced: never = kind;
      void unplaced;
      // At run time a kind this build does not know (the server and the client are
      // deployed by hand, so they can differ) is a hut: the page still draws.
      return "kulba";
    }
  }
}
```

New:

```tsx
import type * as React from "react";
import type { DafLessonKind } from "../../types";
import { joyTanla } from "../sahna-umumiy";

export type JoyId = "kulba" | "koprik" | "gor" | "qala";

/** Every lesson step's place in the forest: a new kind stops compiling here until it has one. */
const JOYLAR: Record<DafLessonKind, JoyId> = { SECTION_A: "kulba", SECTION_B: "koprik", BRIDGE: "gor", UNIT_TEST: "qala" };

/**
 * Which place a lesson is in the forest (spec §8): the first meeting in a hut,
 * the practice on a bridge, the passage test in a cave, the final test in a
 * castle. An old DiB lesson has no step, and a kind this build does not know
 * (the server and the client are deployed by hand) is drawn too: a hut.
 */
export function placeForKind(kind: DafLessonKind | null): JoyId {
  return joyTanla(kind, JOYLAR);
}
```

`O/ormon-tugun.tsx` — butun fayl (Write):

```tsx
import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";
import { SharTugun, type SharRangi } from "../sahna-qismlari";

/**
 * The orb of each state (ormon2.html `.node.done / .cur / .lock`): lit gold, a
 * mint glow, a pale frosted stone (a translucent surface, no backdrop blur —
 * the scene moves under it on every scroll frame). The level colour is not
 * used: the forest has its own light; the sticky banner still shows the level.
 */
export const SHAR: Record<TugunHolat, SharRangi> = {
  done: {
    fon: "radial-gradient(circle at 36% 30%, #fff6d4, #f2cd7a 60%, #e2ae52)",
    soya: "0 8px 20px rgba(0, 0, 0, 0.2), 0 0 26px rgba(255, 227, 160, 0.4)",
    belgi: "#6b4a10",
  },
  active: {
    fon: "radial-gradient(circle at 36% 30%, #f0fffb, #86ead2 60%, #4fcdb3)",
    soya: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 36px rgba(166, 253, 232, 0.67)",
    belgi: "#0d4a3d",
  },
  locked: {
    fon: "color-mix(in srgb, var(--surface-card) 72%, transparent)",
    soya: "0 6px 18px rgba(0, 0, 0, 0.13)",
    belgi: "var(--ink-600)",
  },
};

/** The current node's breathing ring (`.ormon-ring`): a mint halo. */
const HALQA = "0 0 0 10px rgba(166, 253, 232, 0.55)";

/**
 * «O'rmon»'s path node: the shared orb node (`SharTugun`) in the forest's
 * light. Under «Kam harakat» the ring rests at `opacity: 0`; the current
 * node's own mint fill, mint glow and star still tell it apart.
 */
export function OrmonTugun(p: TugunBelgisiProps) {
  return <SharTugun {...p} tema="ormon" shar={SHAR} halqa={HALQA} />;
}
```

`O/ormon-joy.tsx` — butun fayl (Write):

```tsx
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { type JoyKorinishi, SahnaJoy } from "../sahna-qismlari";
import { ACCENT } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";

/** The light behind the emblem, per state (ormon2.html `.pl::before`, `.pl.done`, `.pl.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(255, 233, 162, 0.8), rgba(255, 233, 162, 0))",
  active: "radial-gradient(closest-side, rgba(166, 253, 232, 0.85), rgba(166, 253, 232, 0))",
  locked: "radial-gradient(closest-side, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0))",
};

/** The corner badge, per state (ormon2.html `.pl .bd`); `ormon-kontrast.test.ts` holds each pair to 3:1. */
export const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#f2cd7a", rang: "#5a3d10" },
  active: { fon: "#86ead2", rang: "#0d4a3d" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Fog over a locked place's emblem (ormon2.html `.pl.lock::after`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0))";

const ORMON_JOY: JoyKorinishi = {
  nur: NUR,
  nishon: NISHON,
  tuman: TUMAN,
  accent: ACCENT,
  faolNur: "0 0 40px rgba(166, 253, 232, 0.4)",
};

/**
 * «O'rmon»: one lesson as a place in the forest (spec §8) — a hut, a bridge, a
 * cave or a castle by the lesson's step, drawn by the shared place card
 * (`SahnaJoy`); a locked one is covered in fog.
 */
export function OrmonJoy(p: UnitJoyiProps) {
  const joy = placeForKind(p.kind);
  return <SahnaJoy {...p} tema="ormon" joy={joy} Belgi={JOY_BELGISI[joy]} korinish={ORMON_JOY} />;
}
```

`O/ormon-mukofot-foni.tsx` — butun fayl (Write):

```tsx
import type { MukofotFoniProps } from "../tema-turlari";
import { SahnaMukofotFoni } from "../sahna-qismlari";

/**
 * «O'rmon»: the reward stands in a forest clearing (ormon2.html `.rew`) — the
 * shared reward background in the `--ormon-*` tokens: a soft radial light, a
 * hill at the bottom and, for a celebration, a slow sunburst.
 */
export function OrmonMukofotFoni(p: MukofotFoniProps) {
  return <SahnaMukofotFoni {...p} tema="ormon" />;
}
```

- [ ] **Step 9: Prove O'rmon draws exactly as before**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-oltin.tmp.test.ts`
Expected: PASS, `5 passed` (snapshot'lar Step 2 dagisi bilan bir xil; `-u` BERILMAYDI). Bitta snapshot farq qilsa — «To'xtash shartlari».

Run: `cd client && npx vitest run src/components/student-portal/lernen src/app/globals-css.test.ts src/components/student-portal/lernen-tema-rasmi.test.ts`
Expected: PASS — hamma O'rmon, Toza, sahifa va CSS testlari o'zgartirilmasdan yashil.

- [ ] **Step 10: Register the shared file's texts**

`client/src/i18n/i18n-coverage.test.ts` — Old:

```ts
  "components/student-portal/lernen/tema/ormon/ormon-joy.tsx",
```

New:

```ts
  "components/student-portal/lernen/tema/ormon/ormon-joy.tsx",
  "components/student-portal/lernen/tema/sahna-qismlari.tsx",
```

Run: `cd client && npm run i18n:check`
Expected: PASS (`"{label} — hali ochilmagan"` va `"Boshlash"` lug'atlarda bor; yangi kalit yo'q).

- [ ] **Step 11: Types and lint for the touched files**

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz.

Run: `cd client && npx eslint src/components/student-portal/lernen/tema`
Expected: 0 errors.

- [ ] **Step 12: Remove the temporary golden test**

Run: `rm client/src/components/student-portal/lernen/tema/ormon/ormon-oltin.tmp.test.ts && rm -r client/src/components/student-portal/lernen/tema/ormon/__snapshots__`
Expected: `git status --short` da ular yo'q.

- [ ] **Step 13: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/sahna-umumiy.ts client/src/components/student-portal/lernen/tema/sahna-qismlari.tsx client/src/components/student-portal/lernen/tema/sahna-umumiy.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-biom.ts client/src/components/student-portal/lernen/tema/ormon/ormon-sahna-rejasi.ts client/src/components/student-portal/lernen/tema/ormon/ormon-shakllar.ts client/src/components/student-portal/lernen/tema/ormon/ormon-qatlam.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-joy-belgilari.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-tugun.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-joy.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-mukofot-foni.tsx client/src/i18n/i18n-coverage.test.ts
git commit -m "refactor(lernen): share the scene node, place card, reward and helpers

O'rmon's theme-free pieces move to tema/sahna-umumiy.ts and
tema/sahna-qismlari.tsx so the next scene theme reuses them; O'rmon
becomes thin wrappers and draws byte-identical markup.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client — Dengizning sof qarorlari (zona, reja, devor va bezak shakllari, choki)

**Files:**
- Create: `D/dengiz-zona.ts`, `D/dengiz-reja.ts`
- Test: `D/dengiz-reja.test.ts`

**Interfaces:**
- Consumes: `unitCycleIndex`, `seededRandom`, `between`, `r1`, `TILE` (`T/sahna-umumiy.ts`, Task 1).
- Produces:
  - `D/dengiz-zona.ts`: `ZONE_IDS = ["marjon", "kelp", "chuqur"] as const`, `type ZoneId`, `interface ZonePalette { top; mid; bottom; ridge; rock; decor: readonly [string, string]; fish; banner }` (hammasi `#rrggbb`), `ZONES: Record<ZoneId, ZonePalette>`, `TUBE_STEM = "#8a64c4"`, `ZONE_DEPTH_M: Record<ZoneId, number>` (5, 25, 70), `DEPTH_CHIP_ALPHA = 0.25`, `DARK_VEIL = { color: "#020b1a", alpha: 0.45 }`, `ACCENT = "#0b5f86"`, `zoneForUnit(unitOrder: number): ZoneId`.
  - `D/dengiz-reja.ts`: `WALL_FACTOR = 0.35`, `STRIP_WIDTH = 96`, `WALL_STEP = 80`, `ELEMENT_BUDGET = 300`, `interface DengizPlan { decor: number; sways: number; bubbles: number; schools: number; parallax: boolean }`, `dengizPlan(q: { reduced: boolean; light: boolean }): DengizPlan`, `type DecorKind = "coral" | "fan" | "kelp" | "tube"`, `ZONE_DECOR: Record<ZoneId, readonly DecorKind[]>`, `SWAY_DECOR: Record<ZoneId, DecorKind>`, `type Side = "left" | "right"`, `interface WallPoint { y: number; x: number }`, `wallPoints(seed: number): WallPoint[]`, `wallPath(points: readonly WallPoint[]): string`, `interface Decor { kind: DecorKind; x: number; y: number; scale: number; color: string }`, `decorSpecs(zona: ZoneId, wall: readonly WallPoint[], count: number, seed: number): Decor[]`, `stripShapes(zona: ZoneId, side: Side, count: number): { wall: WallPoint[]; decor: Decor[] }`, `interface Bubble { left; size; rise; delay; dx }`, `bubbleSpecs(count: number, seed?: number): Bubble[]`, `interface School { top; swim; delay; chap: boolean }`, `schoolSpecs(count: number, seed?: number): School[]`, `SCHOOL_FISH: readonly { x: number; y: number; s: number }[]`.

- [ ] **Step 1: Write the failing tests**

`D/dengiz-reja.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TILE } from "../sahna-umumiy";
import {
  ELEMENT_BUDGET,
  STRIP_WIDTH,
  WALL_FACTOR,
  WALL_STEP,
  bubbleSpecs,
  decorSpecs,
  dengizPlan,
  schoolSpecs,
  stripShapes,
  type Side,
  wallPath,
  wallPoints,
} from "./dengiz-reja";
import { ZONE_IDS, ZONES, zoneForUnit } from "./dengiz-zona";

describe("zoneForUnit (spec §5 palitraUnitga)", () => {
  it("dives reef, kelp and deep sea by the unit's order in its level, and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(zoneForUnit)).toEqual(["marjon", "kelp", "chuqur", "marjon", "kelp", "chuqur", "chuqur"]);
  });

  it("gives an exact zone for an order the data should never hold", () => {
    expect(zoneForUnit(0)).toBe("chuqur");
    expect(zoneForUnit(-1)).toBe("kelp");
    expect(zoneForUnit(1.7)).toBe("marjon");
    expect(zoneForUnit(Number.NaN)).toBe("marjon");
    expect(zoneForUnit(Number.POSITIVE_INFINITY)).toBe("marjon");
  });
});

describe("ZONES", () => {
  it("has the mockup's colours for every zone, each a #rrggbb", () => {
    for (const id of ZONE_IDS) {
      const { decor, ...rest } = ZONES[id];
      for (const c of [...Object.values(rest), ...decor]) expect(c, `${id}: ${c}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(Object.keys(ZONES[id]).sort()).toEqual(["banner", "bottom", "decor", "fish", "mid", "ridge", "rock", "top"]);
    }
  });
});

describe("dengizPlan", () => {
  it("draws the full dive: four decorations a strip, two fronds, eight bubbles, two schools, the walls following the scroll", () => {
    expect(dengizPlan({ reduced: false, light: false })).toEqual({ decor: 4, sways: 2, bubbles: 8, schools: 2, parallax: true });
  });

  it("draws about half on a weak device, and no fronds", () => {
    expect(dengizPlan({ reduced: false, light: true })).toEqual({ decor: 2, sways: 0, bubbles: 4, schools: 1, parallax: true });
  });

  it("is a still picture under «Kam harakat»: no parallax, no bubbles, no fish, the walls still drawn", () => {
    for (const light of [false, true]) {
      const plan = dengizPlan({ reduced: true, light });
      expect(plan.parallax).toBe(false);
      expect(plan.bubbles).toBe(0);
      expect(plan.schools).toBe(0);
      expect(plan.decor).toBeGreaterThan(0);
    }
  });

  it("moves its only layer slower than the scroll and keeps a fifth of the spec's element cap", () => {
    expect(WALL_FACTOR).toBeGreaterThan(0);
    expect(WALL_FACTOR).toBeLessThan(1);
    expect(ELEMENT_BUDGET).toBeLessThanOrEqual(1500 / 5);
  });
});

describe("the wall", () => {
  it("is the same wall for a seed, another one for another seed", () => {
    expect(wallPoints(11)).toEqual(wallPoints(11));
    expect(wallPoints(11)).not.toEqual(wallPoints(23));
  });

  it("sets its face every WALL_STEP px from the tile's top to its bottom, near the edge, and ends where it starts", () => {
    const wall = wallPoints(11);
    expect(wall.map((p) => p.y)).toEqual(Array.from({ length: TILE / WALL_STEP + 1 }, (_, i) => i * WALL_STEP));
    expect(wall.at(-1)?.x).toBe(wall[0].x);
    for (const p of wall) {
      expect(p.x).toBeGreaterThanOrEqual(28);
      expect(p.x).toBeLessThanOrEqual(64);
    }
  });

  it("is one closed path from the edge that ends at the tile's bottom", () => {
    const d = wallPath(wallPoints(11));
    expect(d.startsWith("M0 0L")).toBe(true);
    expect(d.endsWith(`L0 ${TILE}Z`)).toBe(true);
  });
});

describe("the wall's decor", () => {
  it("spreads the asked number over the ledges, in the zone's kinds and colours", () => {
    const decor = decorSpecs("marjon", wallPoints(11), 4, 11);
    expect(decor.map((d) => d.kind)).toEqual(["coral", "fan", "coral", "fan"]);
    expect(new Set(decor.map((d) => d.y)).size).toBe(4);
    for (const d of decor) expect(ZONES.marjon.decor).toContain(d.color);
    expect(decorSpecs("kelp", wallPoints(111), 2, 111).map((d) => d.kind)).toEqual(["kelp", "kelp"]);
  });

  it("draws nothing for zero and never more than the ledges", () => {
    expect(decorSpecs("chuqur", wallPoints(211), 0, 211)).toEqual([]);
    expect(decorSpecs("chuqur", wallPoints(211), 50, 211)).toHaveLength(TILE / WALL_STEP - 1);
  });

  it("stays inside the strip: the widest decoration reaches 22 px from its foot", () => {
    for (const d of decorSpecs("marjon", wallPoints(11), 4, 11)) {
      expect(d.x).toBeGreaterThan(0);
      expect(d.x + 22 * d.scale).toBeLessThanOrEqual(STRIP_WIDTH);
    }
  });
});

// The strip draws its tile again every TILE px and its first copy has no copy
// above it: a shape reaching below the tile would be in every copy's top but the
// first one's, and the walls would pop where the offset wraps. Every decoration
// grows UP from its foot, so the feet and the wall's last point are what count.
// The shapes are what the strip draws (`stripShapes`: the real seeds and counts).
describe("the tile's seam", () => {
  it("has the wall end exactly at y = TILE and every foot strictly inside the tile, in every zone and side, full and light", () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const light of [false, true]) {
      const { decor: count } = dengizPlan({ reduced: false, light });
      for (const zona of ZONE_IDS) {
        for (const side of ["left", "right"] as Side[]) {
          const { wall, decor } = stripShapes(zona, side, count);
          seen += wall.length + decor.length;
          if (Math.max(...wall.map((p) => p.y)) !== TILE) wrong.push(`${zona} ${side}: the wall ends at ${wall.at(-1)?.y}`);
          for (const d of decor) if (d.y <= 0 || d.y >= TILE) wrong.push(`${zona} ${side}: a ${d.kind} stands at y = ${d.y}`);
        }
      }
    }
    expect(seen, "no shape was checked").toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });
});

describe("the water's life", () => {
  it("gives the asked number, the same every time; every other school swims left", () => {
    expect(bubbleSpecs(8)).toHaveLength(8);
    expect(bubbleSpecs(8)).toEqual(bubbleSpecs(8));
    expect(schoolSpecs(2)).toEqual(schoolSpecs(2));
    expect(schoolSpecs(2).map((s) => s.chap)).toEqual([false, true]);
  });

  it("keeps the bubbles on screen, small and slow, and the schools in the middle of the water", () => {
    for (const b of bubbleSpecs(8)) {
      expect(b.left).toBeGreaterThanOrEqual(6);
      expect(b.left).toBeLessThanOrEqual(94);
      expect(b.size).toBeGreaterThanOrEqual(4);
      expect(b.size).toBeLessThanOrEqual(12);
      expect(b.rise).toBeGreaterThanOrEqual(18);
    }
    for (const s of schoolSpecs(2)) {
      expect(s.top).toBeGreaterThanOrEqual(18);
      expect(s.top).toBeLessThanOrEqual(70);
      expect(s.swim).toBeGreaterThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz/dengiz-reja.test.ts`
Expected: FAIL — `Failed to resolve import "./dengiz-reja"`.

- [ ] **Step 3: Write the zones**

`D/dengiz-zona.ts`:

```ts
import { unitCycleIndex } from "../sahna-umumiy";

/** The «Dengiz» theme's three zones, top to bottom of a dive (spec §8): the coral reef, the kelp forest, the deep sea. */
export const ZONE_IDS = ["marjon", "kelp", "chuqur"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export interface ZonePalette {
  /** The water: the top, the middle and the bottom of the screen. */
  top: string;
  mid: string;
  bottom: string;
  /** The far ridges on the sea floor (still: never moved). */
  ridge: string;
  /** The rock walls along the two edges (the one layer that follows the scroll). */
  rock: string;
  /** The corals, kelp or glowing tubes on the walls, in turn. */
  decor: readonly [string, string];
  /** The fish crossing the screen. */
  fish: string;
  /** The unit header: white text holds 4.5:1 on it (`dengiz-kontrast.test.ts`). */
  banner: string;
}

/** The CEO-approved mockup's colours (dengiz.html `UBG`, `PAL`, `wall`, `ridges`). */
export const ZONES: Record<ZoneId, ZonePalette> = {
  marjon: {
    top: "#8fe4f6",
    mid: "#5fc0e0",
    bottom: "#5a9fd6",
    ridge: "#8be4ff",
    rock: "#d98aa8",
    decor: ["#ff6f91", "#ffcf4a"],
    fish: "#ffb02e",
    banner: "#0b6a8f",
  },
  kelp: {
    top: "#7fd8dc",
    mid: "#4fb0c4",
    bottom: "#3f8ea0",
    ridge: "#4fc7b8",
    rock: "#5fa898",
    decor: ["#2f9e5a", "#3fae6a"],
    fish: "#ffd166",
    banner: "#1f6b52",
  },
  chuqur: {
    top: "#5f88d0",
    mid: "#5f66b8",
    bottom: "#46408a",
    ridge: "#7a78ff",
    rock: "#5a60a8",
    decor: ["#5ff6ff", "#ff6bf2"],
    fish: "#5ff6ff",
    banner: "#3b3486",
  },
};

/** The glowing tubes' stems (dengiz.html `tube`): a scene colour the contrast test measures too. */
export const TUBE_STEM = "#8a64c4";

/** How deep each zone is, on the unit header's chip (dengiz.html's banners: 5 m, 25 m, 70 m). */
export const ZONE_DEPTH_M: Record<ZoneId, number> = { marjon: 5, kelp: 25, chuqur: 70 };

/** The depth chip is black at this share over the banner: darker still, so its white text holds. */
export const DEPTH_CHIP_ALPHA = 0.25;

/** Dark mode: one still veil over the whole scene instead of a second set of colours. */
export const DARK_VEIL = { color: "#020b1a", alpha: 0.45 } as const;

/** The theme's deep sea blue: the «Boshlash» pill and the current place's ring (white text 7.0:1). */
export const ACCENT = "#0b5f86";

/**
 * Spec §5 `palitraUnitga`: a unit's zone by its order in its level
 * (1 → marjon, 2 → kelp, 3 → chuqur, 4 → marjon …), the same walk as
 * «O'rmon»'s biomes. The path and the unit page both know the order.
 */
export function zoneForUnit(unitOrder: number): ZoneId {
  return ZONE_IDS[unitCycleIndex(unitOrder, ZONE_IDS.length)];
}
```

- [ ] **Step 4: Write the plan and the shapes**

`D/dengiz-reja.ts`:

```ts
import { TILE, between, r1, seededRandom } from "../sahna-umumiy";
import { ZONES, type ZoneId } from "./dengiz-zona";

/** How far the wall strips move per px of scroll: the scene's only parallax (dengiz.html moves its far layer at 0.35). */
export const WALL_FACTOR = 0.35;

/** Width (px) of one wall strip. The walls hug the two edges, so the moving layer is two narrow strips, not the screen. */
export const STRIP_WIDTH = 96;

/** The wall's face is set every this many px down the tile. */
export const WALL_STEP = 80;

/**
 * The scene's element budget. Spec §11 caps a scene at 1500; «Dengiz» is built
 * to a fifth of it, because stage 3 showed the cost lies in the size and the
 * number of moving full-screen layers, not in the decor (ADR-0133).
 */
export const ELEMENT_BUDGET = 300;

export interface DengizPlan {
  /** Corals, kelp or tubes on each wall strip, per tile. */
  decor: number;
  /** Swaying fronds at a zone's bottom corners (0 or 2). */
  sways: number;
  /** Bubbles rising up the screen. */
  bubbles: number;
  /** Fish schools crossing the screen. */
  schools: number;
  /** The wall strips follow the scroll. */
  parallax: boolean;
}

/**
 * What the scene draws (spec §9, ADR-0133). Full: four decorations on each
 * wall strip, two swaying fronds, eight bubbles, two fish schools, the walls
 * following the scroll. A weak device («yengil rejim») draws about half and no
 * fronds. «Kam harakat» is a still picture: no parallax, no bubbles, no fish —
 * the light shafts and the fronds stay, but the CSS holds them still.
 */
export function dengizPlan({ reduced, light }: { reduced: boolean; light: boolean }): DengizPlan {
  return {
    decor: light ? 2 : 4,
    sways: light ? 0 : 2,
    bubbles: reduced ? 0 : light ? 4 : 8,
    schools: reduced ? 0 : light ? 1 : 2,
    parallax: !reduced,
  };
}

export type DecorKind = "coral" | "fan" | "kelp" | "tube";

/** What grows on a zone's walls, in turn (dengiz.html `ZK`, cut to the big soft shapes). */
export const ZONE_DECOR: Record<ZoneId, readonly DecorKind[]> = {
  marjon: ["coral", "fan"],
  kelp: ["kelp"],
  chuqur: ["tube"],
};

/** The swaying frond at a zone's bottom corners. */
export const SWAY_DECOR: Record<ZoneId, DecorKind> = { marjon: "coral", kelp: "kelp", chuqur: "tube" };

export type Side = "left" | "right";

/** A point of a wall's face: `x` px in from the screen's edge, `y` px down the tile. */
export interface WallPoint {
  y: number;
  x: number;
}

/**
 * The rock wall of one tile (dengiz.html `wall`, cut to one tile): its face
 * every `WALL_STEP` px from y = 0 to y = TILE, 28–64 px in from the edge. The
 * last point repeats the first, so the tile's copies join without a step.
 */
export function wallPoints(seed: number): WallPoint[] {
  const rnd = seededRandom(seed);
  const xs = Array.from({ length: TILE / WALL_STEP }, () => r1(between(rnd, 28, 64)));
  return [...xs, xs[0]].map((x, i) => ({ y: i * WALL_STEP, x }));
}

/** The wall as one filled path: out from the edge, down its face in soft bulges, back up the edge. Never below y = TILE. */
export function wallPath(points: readonly WallPoint[]): string {
  let d = `M0 0L${points[0].x} 0`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    d += `Q${r1(a.x + 10)} ${(a.y + b.y) / 2} ${b.x} ${b.y}`;
  }
  return `${d}L0 ${TILE}Z`;
}

/** A wall decoration: its foot at (`x`, `y`) in the strip's own px, grown up from there. */
export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  scale: number;
  color: string;
}

/**
 * `count` decorations on a wall's ledges (its inner points), spread down the
 * tile, in the zone's kinds and colours. Each stands on a ledge strictly inside
 * the tile and grows upward, so nothing reaches below y = TILE (the seam).
 */
export function decorSpecs(zona: ZoneId, wall: readonly WallPoint[], count: number, seed: number): Decor[] {
  const rnd = seededRandom(seed + 1);
  const ledges = wall.slice(1, -1);
  const kinds = ZONE_DECOR[zona];
  const colors = ZONES[zona].decor;
  const n = Math.min(Math.max(count, 0), ledges.length);
  return Array.from({ length: n }, (_, i): Decor => {
    const ledge = ledges[Math.floor(((i + 0.5) * ledges.length) / n)];
    return {
      kind: kinds[i % kinds.length],
      x: r1(ledge.x - 4),
      y: ledge.y,
      scale: r1(between(rnd, 0.8, 1.2)),
      color: colors[i % colors.length],
    };
  });
}

const WALL_SEED: Record<Side, number> = { left: 11, right: 23 };
const ZONE_SEED: Record<ZoneId, number> = { marjon: 0, kelp: 100, chuqur: 200 };

/** One tile of a zone's wall strip — the wall and its decor from the side's and the zone's seeds. The strip draws exactly this. */
export function stripShapes(zona: ZoneId, side: Side, count: number): { wall: WallPoint[]; decor: Decor[] } {
  const seed = WALL_SEED[side] + ZONE_SEED[zona];
  const wall = wallPoints(seed);
  return { wall, decor: decorSpecs(zona, wall, count, seed) };
}

/** A bubble: its column (percent), size (px), one rise and how far into it it starts (s), its sideways drift (px). */
export interface Bubble {
  left: number;
  size: number;
  rise: number;
  delay: number;
  dx: number;
}

export function bubbleSpecs(count: number, seed = 3): Bubble[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (): Bubble => ({
    left: r1(between(rnd, 6, 94)),
    size: Math.round(between(rnd, 4, 12)),
    rise: r1(between(rnd, 18, 30)),
    delay: r1(between(rnd, 0, 20)),
    dx: r1(between(rnd, -18, 18)),
  }));
}

/** A fish school: its height (percent), one crossing and how far into it it starts (s); every other one swims left. */
export interface School {
  top: number;
  swim: number;
  delay: number;
  chap: boolean;
}

export function schoolSpecs(count: number, seed = 5): School[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): School => ({
    top: r1(between(rnd, 18, 70)),
    swim: r1(between(rnd, 40, 60)),
    delay: r1(between(rnd, 0, 30)),
    chap: i % 2 === 1,
  }));
}

/** Where each fish of a school swims (px from the school's spot) and its size against the 30 × 16 fish. */
export const SCHOOL_FISH: readonly { x: number; y: number; s: number }[] = [
  { x: 0, y: 0, s: 1 },
  { x: 28, y: -12, s: 0.8 },
  { x: 34, y: 12, s: 0.9 },
];
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz/dengiz-reja.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/dengiz/dengiz-zona.ts client/src/components/student-portal/lernen/tema/dengiz/dengiz-reja.ts client/src/components/student-portal/lernen/tema/dengiz/dengiz-reja.test.ts
git commit -m "feat(lernen): the Dengiz zones, scene plan and seamless wall shapes

Three zones by the unit's order through the shared cycle, a plan with one
narrow moving layer, and wall tiles that never reach past their seam.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — Dengiz sahnasi (zonalar, qoya tasmalari, ambient, `Sahna`)

**Files:**
- Create: `D/dengiz-bezak.tsx`, `D/dengiz-sahna.tsx`
- Test: `D/dengiz-sahna.test.ts`

**Interfaces:**
- Consumes: `TILE`, `TILE_COPIES` (`T/sahna-umumiy.ts`); Task 2 ning hammasi; `useKamHarakat` (`L/harakat/use-kam-harakat.ts`); `useYengilRejim`, `useSahnaPauza`, `useParallaks` (`L/harakat/use-sahna.ts`); `SahnaProps` (`T/tema-turlari.ts`); `cn`.
- Produces:
  - `D/dengiz-bezak.tsx`: `DECOR_GLYPH: Record<DecorKind, (p: { color: string }) => React.JSX.Element>`, `GLYPH_BOX: Record<DecorKind, string>`, `Baliq(props: { color: string; x: number; y: number; s: number; chap: boolean })`, `DengizDevor` (memo; props `{ zona: ZoneId; side: Side; count: number }`) — `<svg data-omil="0.35" class="dengiz-strip …">`, plitka `id="dengiz-<zona>-<side>-tile"`.
  - `D/dengiz-sahna.tsx`: `DengizSahnaChizma(props: { unitTartibi: number; plan: DengizPlan; kam: boolean; tinch: boolean; ref?: React.Ref<HTMLDivElement> })` — ildiz `data-sahna="dengiz"`, zonalar `data-zona`, `data-faol`; `DengizSahna({ unitTartibi }: SahnaProps)`.
  - CSS sinflari (Task 4 da yoziladi): `dengiz-zone`, `dengiz-strip`, `dengiz-sway`, `dengiz-rays`, `dengiz-bubble`, `dengiz-school` (`[data-chap]`); o'zgaruvchilar `--dengiz-t`, `--dengiz-dx`.

- [ ] **Step 1: Write the failing tests**

`D/dengiz-sahna.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hook reads the device switch in an effect, which a static render never runs.
const kam = vi.hoisted(() => ({ on: false }));
vi.mock("../../harakat/use-kam-harakat", () => ({ useKamHarakat: () => kam.on }));

import { ELEMENT_BUDGET, WALL_FACTOR, dengizPlan } from "./dengiz-reja";
import { DengizSahna, DengizSahnaChizma } from "./dengiz-sahna";
import { ZONES } from "./dengiz-zona";

const chiz = (o: { unitTartibi?: number; reduced?: boolean; light?: boolean; tinch?: boolean }) =>
  renderToStaticMarkup(
    createElement(DengizSahnaChizma, {
      unitTartibi: o.unitTartibi ?? 1,
      plan: dengizPlan({ reduced: o.reduced ?? false, light: o.light ?? false }),
      kam: o.reduced ?? false,
      tinch: o.tinch ?? false,
    }),
  );
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;
const count = (html: string, s: string) => html.split(s).length - 1;

describe("<DengizSahnaChizma />", () => {
  it("shows only the unit's zone; the other two wait hidden for the cross-fade", () => {
    const html = chiz({ unitTartibi: 2 });
    expect(html.match(/data-zona="/g)).toHaveLength(3);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-zona="kelp" data-faol=""/);
    expect(chiz({ unitTartibi: 6 })).toMatch(/data-zona="chuqur" data-faol=""/);
  });

  it("never leaves the water blank: exactly one zone is flagged, whatever the unit order", () => {
    for (const n of [0, -4, 1, 2, 3, 4, 7, 2.9, Number.NaN, Infinity]) {
      expect(chiz({ unitTartibi: n }).match(/data-faol=""/g), String(n)).toHaveLength(1);
    }
  });

  it("stays within its budget, a fifth of the spec's cap, even in full detail", () => {
    const full = tags(chiz({}));
    expect(full).toBeLessThanOrEqual(ELEMENT_BUDGET);
    expect(tags(chiz({ light: true }))).toBeLessThan(full);
  });

  it("moves only the two narrow wall strips of each zone, each one tile drawn four times", () => {
    const html = chiz({});
    expect(count(html, "data-omil=")).toBe(6);
    expect(count(html, `data-omil="${WALL_FACTOR}"`)).toBe(6);
    expect(count(html, "<use ")).toBe(6 * 3);
    expect(html).toContain('href="#dengiz-kelp-right-tile"');
    expect(html).toContain("width:96px;height:calc(100% + 640px)");
  });

  it("gives each zone and side its own tile id, so three zones can stand on one page", () => {
    const html = chiz({});
    for (const zona of ["marjon", "kelp", "chuqur"]) {
      for (const side of ["left", "right"]) expect(count(html, `id="dengiz-${zona}-${side}-tile"`), `${zona} ${side}`).toBe(1);
    }
  });

  it("filters, blurs and blends nothing: no CSS or SVG filter, no backdrop, no blend mode", () => {
    for (const html of [chiz({}), chiz({ light: true }), chiz({ reduced: true })]) {
      expect(html).not.toMatch(/filter/i);
      expect(html).not.toContain("blend");
      expect(html).not.toContain("backdrop-");
    }
  });

  it("draws the water's life by the plan: eight bubbles and two schools, fewer on a weak device, none under «Kam harakat»", () => {
    expect(count(chiz({}), 'class="dengiz-bubble"')).toBe(8);
    expect(count(chiz({}), 'class="dengiz-school"')).toBe(2);
    expect(count(chiz({ light: true }), 'class="dengiz-bubble"')).toBe(4);
    const still = chiz({ reduced: true });
    expect(still).not.toContain("dengiz-bubble");
    expect(still).not.toContain("dengiz-school");
    expect(count(still, 'class="dengiz-rays"')).toBe(1);
  });

  it("sways two fronds in each zone in full detail, none on a weak device", () => {
    expect(count(chiz({}), "dengiz-sway ")).toBe(6);
    expect(chiz({ light: true })).not.toContain("dengiz-sway");
  });

  it("colours the fish by the shown zone", () => {
    expect(chiz({ unitTartibi: 1 })).toContain(`fill="${ZONES.marjon.fish}"`);
    expect(chiz({ unitTartibi: 1 })).not.toContain(`fill="${ZONES.kelp.fish}"`);
    expect(chiz({ unitTartibi: 2 })).toContain(`fill="${ZONES.kelp.fish}"`);
  });

  it("marks its root for the CSS: still under «Kam harakat», held while paused", () => {
    expect(chiz({})).toMatch(/^<div[^>]*data-sahna="dengiz"/);
    expect(chiz({ reduced: true })).toMatch(/^<div[^>]*data-kam-harakat=""/);
    expect(chiz({ tinch: true })).toMatch(/^<div[^>]*data-tinch=""/);
    expect(chiz({})).not.toMatch(/^<div[^>]*data-(?:kam-harakat|tinch)/);
  });

  it("lays one still dark-mode veil over the scene", () => {
    expect(count(chiz({}), "hidden dark:block")).toBe(1);
  });
});

describe("<DengizSahna />", () => {
  // A static render has no device to ask, so it gets the server snapshot: the light scene.
  // (The app never server-renders a scene, see `useYengilRejim`; this pins the safe default.)
  it("draws the light scene from the server snapshot, in the unit's zone", () => {
    kam.on = false;
    const html = renderToStaticMarkup(createElement(DengizSahna, { unitTartibi: 3 }));
    expect(html).toContain('data-sahna="dengiz"');
    expect(html).toMatch(/data-zona="chuqur" data-faol=""/);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).not.toContain("dengiz-sway");
    expect(count(html, 'class="dengiz-bubble"')).toBe(4);
  });

  it("is a still picture under «Kam harakat»: no bubbles, no fish", () => {
    kam.on = true;
    const html = renderToStaticMarkup(createElement(DengizSahna, { unitTartibi: 1 }));
    expect(html).not.toContain("dengiz-bubble");
    expect(html).not.toContain("dengiz-school");
    expect(html).toMatch(/^<div[^>]*data-kam-harakat=""/);
    kam.on = false;
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz/dengiz-sahna.test.ts`
Expected: FAIL — `Failed to resolve import "./dengiz-sahna"`.

- [ ] **Step 3: Write the decorations and the wall strip**

`D/dengiz-bezak.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { TILE, TILE_COPIES } from "../sahna-umumiy";
import { STRIP_WIDTH, WALL_FACTOR, stripShapes, wallPath, type DecorKind, type Side } from "./dengiz-reja";
import { TUBE_STEM, ZONES, type ZoneId } from "./dengiz-zona";

/** A branching coral with pale tips (dengiz.html `coral`: three strokes instead of a recursive tree). */
function Marjon({ color }: { color: string }) {
  return (
    <>
      <path d="M0 0V-30M0 -14L-12 -28M0 -20L11 -38" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M0 -30h.01M-12 -28h.01M11 -38h.01" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="5" strokeLinecap="round" />
    </>
  );
}

/** A sea fan (dengiz.html `fan`): a half disc with pale ribs. */
function Yelpigich({ color }: { color: string }) {
  return (
    <>
      <path d="M-20 0A20 20 0 0 1 20 0Z" fill={color} opacity="0.85" />
      <path d="M0 0L-14 -14M0 0L0 -20M0 0L14 -14" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
    </>
  );
}

/** A kelp frond (dengiz.html `kelp`, one soft blade). */
function Kelp({ color }: { color: string }) {
  return <path d="M-3 0C-12 -40 8 -70 -2 -110C10 -72 -2 -40 5 0Z" fill={color} />;
}

/** Glowing tubes of the deep (dengiz.html `tube`): stems with bright round tips. */
function Naycha({ color }: { color: string }) {
  return (
    <>
      <path d="M-8 0V-22M0 0V-32M8 0V-18" stroke={TUBE_STEM} strokeWidth="4" strokeLinecap="round" />
      <path d="M-8 -24h.01M0 -34h.01M8 -20h.01" stroke={color} strokeWidth="8" strokeLinecap="round" />
    </>
  );
}

/** Each decoration drawn at its own foot (0, 0), growing up: still SVG, two shapes at most. */
export const DECOR_GLYPH: Record<DecorKind, (p: { color: string }) => React.JSX.Element> = {
  coral: Marjon,
  fan: Yelpigich,
  kelp: Kelp,
  tube: Naycha,
};

/** Each decoration's box (`viewBox`) around its foot: a frond drawn alone is scaled to fill its element. */
export const GLYPH_BOX: Record<DecorKind, string> = {
  coral: "-16 -42 32 42",
  fan: "-22 -22 44 22",
  kelp: "-14 -112 28 112",
  tube: "-12 -38 24 38",
};

/** One fish facing right (dengiz.html `fish`), `s` times its 30 × 16 size; a school swimming left mirrors it. */
export function Baliq({ color, x, y, s, chap }: { color: string; x: number; y: number; s: number; chap: boolean }) {
  return (
    <svg
      viewBox="0 0 30 16"
      width={30 * s}
      height={16 * s}
      className="absolute"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      <g transform={chap ? "matrix(-1 0 0 1 30 0)" : undefined}>
        <path d="M2 8L9 2 8 8 9 14Z" fill={color} />
        <path d="M8 8Q16 -2 27 8Q16 18 8 8Z" fill={color} />
        <circle cx="23" cy="6.6" r="1.6" fill="#ffffff" />
      </g>
    </svg>
  );
}

/**
 * One wall strip of one zone: a 96 px column of rock and decor at one edge,
 * one 640 px tile drawn `TILE_COPIES` times with `<use>`, the screen plus a
 * tile tall, so the parallax (`useParallaks` reads `data-omil`) wraps it
 * forever. It is the scene's only moving layer, and narrow on purpose: no
 * filter, no blur, nothing full-screen (ADR-0133). The right strip is the
 * left one's mirror image with its own seed.
 */
export const DengizDevor = React.memo(function DengizDevor({
  zona,
  side,
  count,
}: {
  zona: ZoneId;
  side: Side;
  count: number;
}) {
  const p = ZONES[zona];
  const { wall, decor } = stripShapes(zona, side, count);
  const id = `dengiz-${zona}-${side}`;
  return (
    <svg
      data-omil={WALL_FACTOR}
      aria-hidden="true"
      className={cn("dengiz-strip absolute top-0", side === "left" ? "left-0" : "right-0")}
      style={{ width: STRIP_WIDTH, height: `calc(100% + ${TILE}px)` }}
    >
      <g transform={side === "right" ? `matrix(-1 0 0 1 ${STRIP_WIDTH} 0)` : undefined}>
        <g id={`${id}-tile`}>
          <path d={wallPath(wall)} fill={p.rock} />
          {decor.map((d, i) => {
            const Glyph = DECOR_GLYPH[d.kind];
            return (
              <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.scale})`}>
                <Glyph color={d.color} />
              </g>
            );
          })}
        </g>
        {Array.from({ length: TILE_COPIES - 1 }, (_, i) => (
          <use key={i} href={`#${id}-tile`} y={TILE * (i + 1)} />
        ))}
      </g>
    </svg>
  );
});
```

- [ ] **Step 4: Write the scene**

`D/dengiz-sahna.tsx`:

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useKamHarakat } from "../../harakat/use-kam-harakat";
import { useParallaks, useSahnaPauza, useYengilRejim } from "../../harakat/use-sahna";
import { TILE } from "../sahna-umumiy";
import type { SahnaProps } from "../tema-turlari";
import { Baliq, DECOR_GLYPH, DengizDevor, GLYPH_BOX } from "./dengiz-bezak";
import { SCHOOL_FISH, SWAY_DECOR, bubbleSpecs, dengizPlan, schoolSpecs, type DengizPlan } from "./dengiz-reja";
import { DARK_VEIL, ZONE_IDS, ZONES, zoneForUnit, type ZoneId } from "./dengiz-zona";

/** Inline style with the custom properties the CSS animations read (`--dengiz-*`). */
const vars = (o: Record<string, string | number>) => o as React.CSSProperties;

/** The far ridges on the sea floor, in a 100 × 100 box stretched over the lower part of the screen (dengiz.html `ridges`, without its blur). */
const RIDGE_BACK = "M0 55Q15 35 32 50T64 46T100 40V100H0Z";
const RIDGE_FRONT = "M0 78Q22 60 46 74T100 68V100H0Z";

/**
 * One zone: still water, still ridges, the two wall strips (the only layer
 * that moves with the scroll) and its swaying fronds at the bottom corners.
 * Only the unit's zone shows (`data-faol`); the others wait hidden for the
 * cross-fade.
 */
function DengizZona({ zona, faol, plan }: { zona: ZoneId; faol: boolean; plan: DengizPlan }) {
  const p = ZONES[zona];
  const Frond = DECOR_GLYPH[SWAY_DECOR[zona]];
  return (
    <div data-zona={zona} data-faol={faol ? "" : undefined} className="dengiz-zone absolute inset-0">
      <div className="absolute inset-0" style={{ background: `linear-gradient(${p.top}, ${p.mid} 45%, ${p.bottom})` }} />
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-2/5 w-full"
      >
        <path d={RIDGE_BACK} fill={p.ridge} opacity="0.35" />
        <path d={RIDGE_FRONT} fill={p.ridge} opacity="0.5" />
      </svg>
      <DengizDevor zona={zona} side="left" count={plan.decor} />
      <DengizDevor zona={zona} side="right" count={plan.decor} />
      {(["left", "right"] as const).slice(0, plan.sways).map((side, i) => (
        <svg
          key={side}
          aria-hidden="true"
          viewBox={GLYPH_BOX[SWAY_DECOR[zona]]}
          preserveAspectRatio="xMidYMax meet"
          className={cn("dengiz-sway absolute bottom-0 h-40 w-24", side === "left" ? "-left-4" : "-right-4")}
          style={vars({ "--dengiz-t": `${9 + i * 2}s` })}
        >
          <Frond color={p.decor[i % 2]} />
        </svg>
      ))}
    </div>
  );
}

/**
 * The water's moving life (dengiz.html `.rays`, `.bub`, `.school`): the light
 * shafts always (held still under «Kam harakat»), the bubbles and the fish
 * schools only as many as the plan allows, the fish in the shown zone's
 * colour. globals.css moves them with transform and opacity only.
 */
function DengizAmbient({ plan, fish }: { plan: DengizPlan; fish: string }) {
  return (
    <div className="absolute inset-0">
      <div className="dengiz-rays" />
      {bubbleSpecs(plan.bubbles).map((b, i) => (
        <span
          key={`b${i}`}
          className="dengiz-bubble"
          style={vars({
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            "--dengiz-t": `${b.rise}s`,
            "--dengiz-dx": `${b.dx}px`,
            animationDelay: `-${b.delay}s`,
          })}
        />
      ))}
      {schoolSpecs(plan.schools).map((s, i) => (
        <div
          key={`s${i}`}
          className="dengiz-school"
          data-chap={s.chap ? "" : undefined}
          style={vars({ top: `${s.top}%`, "--dengiz-t": `${s.swim}s`, animationDelay: `-${s.delay}s` })}
        >
          {SCHOOL_FISH.map((f, k) => (
            <Baliq key={k} color={fish} x={f.x} y={f.y} s={f.s} chap={s.chap} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface DengizSahnaChizmaProps {
  unitTartibi: number;
  plan: DengizPlan;
  /** «Kam harakat»: marks the root, so the CSS stops every animation and the zone fade. */
  kam: boolean;
  /** The tab is hidden or the scene is off screen: the drifting life holds still. */
  tinch: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Draws the «Dengiz» scene for a given plan — no hooks, so a test can render
 * any state. Three zone stacks stand on the page and only the unit's zone
 * shows; the water's life and the dark-mode veil lie over them.
 */
export function DengizSahnaChizma({ unitTartibi, plan, kam, tinch, ref }: DengizSahnaChizmaProps) {
  const zona = zoneForUnit(unitTartibi);
  return (
    <div
      ref={ref}
      data-sahna="dengiz"
      data-kam-harakat={kam ? "" : undefined}
      data-tinch={tinch ? "" : undefined}
      className="absolute inset-0"
    >
      {ZONE_IDS.map((id) => (
        <DengizZona key={id} zona={id} faol={id === zona} plan={plan} />
      ))}
      <DengizAmbient plan={plan} fish={ZONES[zona].fish} />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: DARK_VEIL.color, opacity: DARK_VEIL.alpha }}
      />
    </div>
  );
}

/**
 * «Dengiz»'s `Sahna` (spec §8, ADR-0133): a dive in three zones by the unit,
 * the walls following the scroll, bubbles, fish and swaying fronds. A weak
 * device draws about half, «Kam harakat» a still picture, and it holds still
 * while hidden.
 */
export function DengizSahna({ unitTartibi }: SahnaProps) {
  const kam = useKamHarakat();
  const yengil = useYengilRejim();
  const ildiz = React.useRef<HTMLDivElement>(null);
  const tinch = useSahnaPauza(ildiz);
  const plan = React.useMemo(() => dengizPlan({ reduced: kam, light: yengil }), [kam, yengil]);
  // The six strips are always drawn (only their decor count changes), so the list of moving layers never changes.
  useParallaks(ildiz, { faol: plan.parallax, tinch, tile: TILE, kalit: "devor" });
  return <DengizSahnaChizma ref={ildiz} unitTartibi={unitTartibi} plan={plan} kam={kam} tinch={tinch} />;
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz`
Expected: PASS (`dengiz-reja`, `dengiz-sahna`). To'liq sahna ~180 element, yengil ~115 (`ELEMENT_BUDGET` 300 dan ancha past).

- [ ] **Step 6: Lint**

Run: `cd client && npx eslint src/components/student-portal/lernen/tema/dengiz`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/dengiz/dengiz-bezak.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-sahna.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-sahna.test.ts
git commit -m "feat(lernen): the Dengiz scene, with one narrow moving layer

Three zones of still water and ridges; the only parallax is two 96 px
wall strips; bubbles, fish and fronds by the plan; no filter anywhere.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — Dengiz harakati (`.dengiz-*` CSS) va CSS skanerini ikki temaga parametrlash

**Files:**
- Modify: `client/src/app/globals.css` (fayl oxiriga yangi blok)
- Modify: `client/src/app/globals-css.test.ts`

**Interfaces:**
- Consumes: Task 3 dagi sinflar va o'zgaruvchilar (`dengiz-zone`, `dengiz-strip`, `dengiz-sway`, `dengiz-rays`, `dengiz-bubble`, `dengiz-school[data-chap]`, `--dengiz-t`, `--dengiz-dx`); Task 1 dagi `<id>-ring`, `<id>-bob`, `<id>-burst` (Dengiz uchun: `dengiz-ring`, `dengiz-bob`, `dengiz-burst`).
- Produces: `@keyframes dengiz-sway, dengiz-rise, dengiz-swim, dengiz-rays, dengiz-ring, dengiz-bob, dengiz-spin`; test yordamchilari `themeRules(css, theme)`, `inThemeKeyframes(rule, theme)`, `themeViolations(rules, theme)` (`theme: "ormon" | "dengiz"`).

- [ ] **Step 1: Parametrise the scan and write the failing Dengiz tests**

`client/src/app/globals-css.test.ts` — Old:

```ts
const inOrmonKeyframes = (r: CssRule) => r.context.some((c) => c.startsWith("@keyframes ormon-"));

/** The rules that are the «O'rmon» theme's: a selector naming an `.ormon-*` class, and the steps of an `@keyframes ormon-*`. */
const ormonRules = (css: string) => leafRules(css).filter((r) => /\.ormon-/.test(r.selector) || inOrmonKeyframes(r));
```

New:

```ts
/**
 * The scene themes and, for each, the one layer that may carry a compositor
 * hint: the shown biome's or zone's moving layer (ADR-0132, ADR-0133).
 */
const SCENE_THEMES = {
  ormon: ".lumio .ormon-biome[data-faol] .ormon-layer",
  dengiz: ".lumio .dengiz-zone[data-faol] .dengiz-strip",
} as const;
type SceneTheme = keyof typeof SCENE_THEMES;

const inThemeKeyframes = (r: CssRule, theme: SceneTheme) => r.context.some((c) => c.startsWith(`@keyframes ${theme}-`));

/** The rules that are a theme's: a selector naming one of its `.<theme>-*` classes, and the steps of an `@keyframes <theme>-*`. */
const themeRules = (css: string, theme: SceneTheme) =>
  leafRules(css).filter((r) => r.selector.includes(`.${theme}-`) || inThemeKeyframes(r, theme));
```

Old:

```ts
const LAYER_SHOWN = ".lumio .ormon-biome[data-faol] .ormon-layer";
const LAYER_SHOWN_NO_PARALLAX = ".lumio [data-kam-harakat] .ormon-biome[data-faol] .ormon-layer";

/** Each slip as `kind: where`. */
function ormonViolations(rules: CssRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    const where = [...r.context, r.selector].join(" > ");
    const reduced = r.context.some((c) => c.startsWith("@media") && c.includes("prefers-reduced-motion"));
    const body = withoutComments(r.body);
    if (!inOrmonKeyframes(r)) {
```

New:

```ts
/** Each slip as `kind: where`. */
function themeViolations(rules: CssRule[], theme: SceneTheme): string[] {
  const LAYER_SHOWN = SCENE_THEMES[theme];
  // The same layer where there is no parallax («Kam harakat»): its hint is taken back.
  const LAYER_SHOWN_NO_PARALLAX = LAYER_SHOWN.replace(".lumio ", ".lumio [data-kam-harakat] ");
  const out: string[] = [];
  for (const r of rules) {
    const where = [...r.context, r.selector].join(" > ");
    const reduced = r.context.some((c) => c.startsWith("@media") && c.includes("prefers-reduced-motion"));
    const body = withoutComments(r.body);
    if (!inThemeKeyframes(r, theme)) {
```

Old:

```ts
    const rules = ormonRules(readFileSync(path.join(__dirname, "globals.css"), "utf8"));
    // A scan that sees nothing would pass on any stylesheet.
    expect(rules.length, "no .ormon-* rule found: the scan is blind").toBeGreaterThan(0);
    expect(rules.some(inOrmonKeyframes), "no @keyframes ormon-* found: the scan is blind").toBe(true);
    expect(ormonViolations(rules)).toEqual([]);
```

New:

```ts
    const rules = themeRules(readFileSync(path.join(__dirname, "globals.css"), "utf8"), "ormon");
    // A scan that sees nothing would pass on any stylesheet.
    expect(rules.length, "no .ormon-* rule found: the scan is blind").toBeGreaterThan(0);
    expect(rules.some((r) => inThemeKeyframes(r, "ormon")), "no @keyframes ormon-* found: the scan is blind").toBe(true);
    expect(themeViolations(rules, "ormon")).toEqual([]);
```

Old:

```ts
    const kinds = ormonViolations(ormonRules(bad)).map((v) => v.split(":")[0]);
```

New:

```ts
    const kinds = themeViolations(themeRules(bad, "ormon"), "ormon").map((v) => v.split(":")[0]);
```

Fayl OXIRIGA:

```ts
// ---------------------------------------------------------------------------
// «Dengiz» (ADR-0133): O'rmon's rules, its own pins and the same scan.
// ---------------------------------------------------------------------------

describe("the «Dengiz» scene's motion (ADR-0133)", () => {
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const flat = css.replace(/\s+/g, " ");
  const list =
    ":is(.dengiz-bubble, .dengiz-school, .dengiz-rays, .dengiz-sway, .dengiz-ring, .dengiz-bob, .dengiz-burst)";

  it("animates only transform and opacity", () => {
    const frames = [...css.matchAll(/@keyframes (dengiz-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1])).toEqual([
      "dengiz-sway",
      "dengiz-rise",
      "dengiz-swim",
      "dengiz-rays",
      "dengiz-ring",
      "dengiz-bob",
      "dengiz-spin",
    ]);
    for (const [, name, body] of frames) {
      const props = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].filter((p) => p !== "transform" && p !== "opacity"), name).toEqual([]);
    }
  });

  it("holds the drifting life still while the scene is paused", () => {
    expect(flat).toContain(
      ".lumio [data-tinch] :is(.dengiz-bubble, .dengiz-school, .dengiz-rays, .dengiz-sway) { animation-play-state: paused; }",
    );
  });

  it("holds a hidden zone's fronds still, so they run no timeline unseen", () => {
    expect(flat).toContain(".lumio .dengiz-zone:not([data-faol]) .dengiz-sway { animation-play-state: paused; }");
  });

  it("stops every animation and the zone fade under the device's «Kam harakat» switch", () => {
    expect(flat).toContain(
      `.lumio [data-kam-harakat] ${list}, .lumio [data-kam-harakat] .dengiz-zone { animation: none; transition: none; }`,
    );
  });

  it("does the same under the system setting, also for the shown zone", () => {
    expect(flat).toContain(
      `@media (prefers-reduced-motion: reduce) { .lumio ${list}, .lumio .dengiz-zone, .lumio .dengiz-zone[data-faol] { animation: none; transition: none; }`,
    );
  });

  it("gives only the shown zone's wall strips a compositor hint, and takes it back where there is no parallax", () => {
    const base = ".lumio .dengiz-zone[data-faol] .dengiz-strip { will-change: transform; }";
    const kamReset = ".lumio [data-kam-harakat] .dengiz-zone[data-faol] .dengiz-strip { will-change: auto; }";
    const mediaReset = ".lumio .dengiz-zone[data-faol] .dengiz-strip { will-change: auto; } }";
    const mediaAt = flat.indexOf(`@media (prefers-reduced-motion: reduce) { .lumio ${list}`);
    expect(flat).toContain(base);
    expect(flat).toContain(kamReset);
    expect(mediaAt).toBeGreaterThan(-1);
    expect(flat.slice(mediaAt)).toContain(mediaReset);
    expect(flat.indexOf(base)).toBeLessThan(flat.indexOf(kamReset));
    expect(flat.indexOf(base)).toBeLessThan(mediaAt);
  });

  // The glass and overlay rules key on `[data-sahna]`: Dengiz needs no rule of its own, only the attribute.
  it("is covered by the glass and overlay rules through the attribute its root carries", () => {
    const portal = path.join(__dirname, "../components/student-portal");
    expect(readFileSync(path.join(portal, "lernen/tema/dengiz/dengiz-sahna.tsx"), "utf8")).toContain('data-sahna="dengiz"');
  });
});

describe("every «Dengiz» rule in globals.css (ADR-0133)", () => {
  it("is scoped to .lumio, has no comment inside its block, no filter, and a will-change only where the strips move", () => {
    const rules = themeRules(readFileSync(path.join(__dirname, "globals.css"), "utf8"), "dengiz");
    // A scan that sees nothing would pass on any stylesheet.
    expect(rules.length, "no .dengiz-* rule found: the scan is blind").toBeGreaterThan(0);
    expect(rules.some((r) => inThemeKeyframes(r, "dengiz")), "no @keyframes dengiz-* found: the scan is blind").toBe(true);
    expect(themeViolations(rules, "dengiz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify the O'rmon part stays green and the Dengiz part fails**

Run: `cd client && npx vitest run src/app/globals-css.test.ts`
Expected: O'rmon va boshqa hamma mavjud `it` PASS (kutilmalar o'zgarmagan); yangi Dengiz `it`'lari FAIL — `expected [] to deeply equal [ 'dengiz-sway', … ]`, `no .dengiz-* rule found: the scan is blind`. («glass … attribute» testi allaqachon PASS — Task 3 fayli bor.)

- [ ] **Step 3: Write the Dengiz motion**

`client/src/app/globals.css` — Old (faylning oxiri):

```css
  /* The system setting has no parallax either. After the visible biome's
     rule and as specific as it, so it wins over it. */
  .lumio .ormon-biome[data-faol] .ormon-layer {
    will-change: auto;
  }
}
```

New:

```css
  /* The system setting has no parallax either. After the visible biome's
     rule and as specific as it, so it wins over it. */
  .lumio .ormon-biome[data-faol] .ormon-layer {
    will-change: auto;
  }
}

/* ============================================================
   Ta'lim · «Dengiz» theme (ADR-0133): the dive behind the path and
   the unit page, the node ring, the places and the reward. Built
   cheaper than O'rmon: per zone one still water gradient and still
   ridges; the only layer that follows the scroll is two narrow wall
   strips. Only transform and opacity animate, nothing is filtered or
   blended. Everything stops under the device's «Kam harakat» switch
   and the system setting; the drifting life holds still while the
   scene is paused (data-tinch: the tab is hidden or it is off screen).
   ============================================================ */

/* One zone shows at a time; the hidden ones are not painted at all.
   A zone change is an opacity cross-fade. */
.lumio .dengiz-zone {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 700ms var(--ease-in-out),
    visibility 0s linear 700ms;
}

.lumio .dengiz-zone[data-faol] {
  opacity: 1;
  visibility: visible;
  transition:
    opacity 700ms var(--ease-in-out),
    visibility 0s;
}

/* Only the shown zone's wall strips get a compositor layer of their own. */
.lumio .dengiz-zone[data-faol] .dengiz-strip {
  will-change: transform;
}

/* A frond at a bottom corner sways from its foot. */
.lumio .dengiz-sway {
  transform-origin: 50% 100%;
  animation: dengiz-sway var(--dengiz-t) ease-in-out infinite alternate;
}

@keyframes dengiz-sway {
  from {
    transform: rotate(-3deg);
  }
  to {
    transform: rotate(3deg);
  }
}

/* A bubble rises from below the screen and fades out near the top. */
.lumio .dengiz-bubble {
  position: absolute;
  bottom: -24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: radial-gradient(circle at 30% 28%, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.06) 60%);
  opacity: 0;
  animation: dengiz-rise var(--dengiz-t) linear infinite;
}

@keyframes dengiz-rise {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  8% {
    opacity: 0.9;
  }
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translate(var(--dengiz-dx), -110vh);
    opacity: 0;
  }
}

/* A fish school crosses the screen; every other one swims back. */
.lumio .dengiz-school {
  position: absolute;
  left: 0;
  animation: dengiz-swim var(--dengiz-t) linear infinite;
}

.lumio .dengiz-school[data-chap] {
  animation-direction: reverse;
}

@keyframes dengiz-swim {
  from {
    transform: translateX(-140px);
  }
  to {
    transform: translateX(110vw);
  }
}

/* Light from the surface: soft stripes, with no blur filter and no blend
   mode, fading out down the screen. */
.lumio .dengiz-rays {
  position: absolute;
  top: 0;
  left: -60px;
  right: -60px;
  height: 60%;
  background: repeating-linear-gradient(
    100deg,
    transparent 0 70px,
    rgba(255, 255, 255, 0.16) 100px,
    transparent 130px 220px
  );
  -webkit-mask-image: linear-gradient(#000, transparent 85%);
  mask-image: linear-gradient(#000, transparent 85%);
  animation: dengiz-rays 24s ease-in-out infinite alternate;
}

@keyframes dengiz-rays {
  from {
    transform: translateX(-24px);
    opacity: 0.55;
  }
  to {
    transform: translateX(24px);
    opacity: 1;
  }
}

/* The current node's ring rests invisible: with no animation it is simply
   not there. */
.lumio .dengiz-ring {
  opacity: 0;
  animation: dengiz-ring 2.6s ease-out infinite;
}

@keyframes dengiz-ring {
  from {
    transform: scale(1);
    opacity: 0.6;
  }
  to {
    transform: scale(1.45);
    opacity: 0;
  }
}

/* The current place's emblem bobs in the water. */
.lumio .dengiz-bob {
  animation: dengiz-bob 2.6s ease-in-out infinite;
}

@keyframes dengiz-bob {
  50% {
    transform: translateY(-5px);
  }
}

/* The reward's slow light rays. */
.lumio .dengiz-burst {
  animation: dengiz-spin 40s linear infinite;
}

@keyframes dengiz-spin {
  to {
    transform: rotate(360deg);
  }
}

.lumio [data-tinch] :is(.dengiz-bubble, .dengiz-school, .dengiz-rays, .dengiz-sway) {
  animation-play-state: paused;
}

/* A hidden zone is not painted, but its fronds' timelines would still run. */
.lumio .dengiz-zone:not([data-faol]) .dengiz-sway {
  animation-play-state: paused;
}

/* Later than every rule above, so it wins over them. */
.lumio [data-kam-harakat] :is(.dengiz-bubble, .dengiz-school, .dengiz-rays, .dengiz-sway, .dengiz-ring, .dengiz-bob, .dengiz-burst),
.lumio [data-kam-harakat] .dengiz-zone {
  animation: none;
  transition: none;
}

/* No parallax here, so the strips need no compositor layer of their own.
   One attribute more than the shown zone's rule, so it wins over it. */
.lumio [data-kam-harakat] .dengiz-zone[data-faol] .dengiz-strip {
  will-change: auto;
}

@media (prefers-reduced-motion: reduce) {
  .lumio :is(.dengiz-bubble, .dengiz-school, .dengiz-rays, .dengiz-sway, .dengiz-ring, .dengiz-bob, .dengiz-burst),
  .lumio .dengiz-zone,
  .lumio .dengiz-zone[data-faol] {
    animation: none;
    transition: none;
  }

  /* The system setting has no parallax either. After the shown zone's
     rule and as specific as it, so it wins over it. */
  .lumio .dengiz-zone[data-faol] .dengiz-strip {
    will-change: auto;
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd client && npx vitest run src/app/globals-css.test.ts`
Expected: PASS (O'rmon va Dengiz bloklari, `@theme` testi, overlay testi — `data-sahna` li qoidalar hali ham faqat ikkita).

- [ ] **Step 5: The CSS still reaches the browser (Lightning CSS)**

Run: `cd client && npx next build`
Expected: muvaffaqiyatli. So'ng: `grep -rl "dengiz-rise" client/.next/static --include='*.css'` — kamida bitta fayl (Lightning CSS blokni tashlab yubormagan); `grep -rl "dengiz-zone\[data-faol\] .dengiz-strip" client/.next/static --include='*.css'` ham kamida bitta. (Testlar bilan parallel EMAS.)

- [ ] **Step 6: Commit**

```bash
git add client/src/app/globals.css client/src/app/globals-css.test.ts
git commit -m "feat(lernen): the Dengiz scene's motion, and the CSS scan for both themes

Transform and opacity only; paused while hidden, still under Kam harakat
and the system setting; will-change only on the shown zone's strips.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — dengiz tuguni, joylar (chig'anoq uyi, kema, g'or, xazina) va unit lavhasi

**Files:**
- Create: `D/dengiz-tugun.tsx`, `D/dengiz-joy.tsx`, `D/dengiz-unit-lavha.tsx`
- Test: `D/dengiz-orinlar.test.ts`
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`), `client/src/i18n/dictionaries/ru.ts`, `de.ts`, `en.ts` (`"{n} m"`)

**Interfaces:**
- Consumes: `SharTugun`, `SahnaJoy`, `type SharRangi`, `type JoyKorinishi`, `type BelgiProps` (`T/sahna-qismlari.tsx`); `joyTanla` (`T/sahna-umumiy.ts`); `ACCENT`, `ZONES`, `ZONE_DEPTH_M`, `DEPTH_CHIP_ALPHA`, `zoneForUnit`, `type ZoneId` (`D/dengiz-zona.ts`); `Dafi` (`L/dafi/dafi.tsx`, `holat="salom" olcham="sm"`); `useT`; `TugunBelgisiProps`, `TugunHolat`, `UnitJoyiProps`, `UnitLavhaProps`; `DafLessonKind`.
- Produces:
  - `D/dengiz-tugun.tsx`: `SHAR: Record<TugunHolat, SharRangi>`, `HALQA: string`, `DengizTugun(p: TugunBelgisiProps)` — `data-tugun="dengiz"`, halqa `dengiz-ring`.
  - `D/dengiz-joy.tsx`: `type DengizJoyId = "chiganoq" | "kema" | "gor" | "xazina"`, `placeForKind(kind: DafLessonKind | null): DengizJoyId`, `JOY_BELGISI: Record<DengizJoyId, (p: BelgiProps) => React.JSX.Element>`, `NISHON: Record<TugunHolat, { fon: string; rang: string }>`, `DengizJoy(p: UnitJoyiProps)` — `data-joy`, `dengiz-bob`, `data-tuman`.
  - `D/dengiz-unit-lavha.tsx`: `DengizUnitLavha({ matn, unitTartibi }: UnitLavhaProps)` — `data-lavha-zona`, chuqurlik belgisi `t("{n} m", { n })`.

- [ ] **Step 1: Write the failing tests**

`D/dengiz-orinlar.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunBelgisiProps, UnitJoyiProps } from "../tema-turlari";
import { CARD_SURFACE_ALPHA } from "../sahna-umumiy";
import { DengizJoy, JOY_BELGISI, placeForKind } from "./dengiz-joy";
import { DengizTugun } from "./dengiz-tugun";
import { DengizUnitLavha } from "./dengiz-unit-lavha";
import { ACCENT, DEPTH_CHIP_ALPHA, ZONES } from "./dengiz-zona";

const tugun = (p: Partial<TugunBelgisiProps>) =>
  renderToStaticMarkup(
    createElement(DengizTugun, { label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {}, ...p }),
  );

const joy = (p: Partial<UnitJoyiProps>) =>
  renderToStaticMarkup(
    createElement(DengizJoy, {
      label: "Tanishuv",
      kind: "SECTION_A",
      holat: "active",
      tone: "coral",
      izoh: null,
      tartib: 0,
      onClick: () => {},
      onBosilmagan: () => {},
      ...p,
    }),
  );

describe("<DengizTugun />", () => {
  it("the current node is the gold orb with a ring, pressable and named by its section", () => {
    const html = tugun({});
    expect(html).toContain('data-tugun="dengiz"');
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).toContain("dengiz-ring");
    expect(html).toContain("#ffbe55");
    expect(html).not.toContain("aria-disabled");
  });

  it("a finished node is the pearl, whatever the level colour", () => {
    expect(tugun({ holat: "done", tone: "teal" })).toBe(tugun({ holat: "done", tone: "grape" }));
    expect(tugun({ holat: "done" })).toContain("#d9b8fb");
  });

  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = tugun({ holat: "locked", onClick: undefined, onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).not.toContain("dengiz-ring");
  });

  it("writes its name on a positioned plain surface pill in the darkest ink", () => {
    expect(tugun({})).toMatch(/<span class="[^"]*\brelative\b[^"]*\bbg-surface\b[^"]*\btext-ink-900\b[^"]*">Tanishuv</);
    expect(tugun({})).not.toContain("backdrop-");
  });
});

describe("placeForKind (spec §8)", () => {
  it("is a shell house, a ship, a cave and the treasure along the unit; an old lesson is the shell house", () => {
    expect(placeForKind("SECTION_A")).toBe("chiganoq");
    expect(placeForKind("SECTION_B")).toBe("kema");
    expect(placeForKind("BRIDGE")).toBe("gor");
    expect(placeForKind("UNIT_TEST")).toBe("xazina");
    expect(placeForKind(null)).toBe("chiganoq");
  });

  // The client and the server are deployed by hand, so the server can send a kind
  // this build does not know. The page must still draw a place, not throw.
  it("draws an unknown kind as the shell house, a place that has an emblem", () => {
    const unknown = "FUTURE_KIND" as unknown as Parameters<typeof placeForKind>[0];
    expect(placeForKind(unknown)).toBe("chiganoq");
    expect(JOY_BELGISI[placeForKind(unknown)]).toBeTypeOf("function");
    expect(joy({ kind: unknown })).toContain('data-joy="chiganoq"');
  });

  it("gives every place a small, still emblem", () => {
    for (const Belgi of Object.values(JOY_BELGISI)) {
      const html = renderToStaticMarkup(createElement(Belgi, {}));
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(10);
    }
  });
});

describe("<DengizJoy />", () => {
  it("draws the lesson as its place under the sea", () => {
    expect(joy({ kind: "SECTION_B" })).toContain('data-joy="kema"');
    expect(joy({ kind: "BRIDGE" })).toContain('data-joy="gor"');
    expect(joy({ kind: "UNIT_TEST" })).toContain('data-joy="xazina"');
  });

  it("offers «Boshlash» on the deep sea blue only on the current place, and its emblem bobs", () => {
    const html = joy({});
    expect(html).toContain(`style="background:${ACCENT}">Boshlash<`);
    expect(html).toContain("dengiz-bob");
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("keeps a locked place pressable for the locked sound, tells it is closed, and leaves it in the murk", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).toContain("data-tuman");
    expect(html).toContain("rgba(14, 34, 80, 0.7)");
    expect(joy({})).not.toContain("data-tuman");
  });

  it("alternates sides down the page and keeps the name clear of the corner badge", () => {
    expect(joy({ tartib: 1 })).toContain("flex-row-reverse");
    expect(joy({ tartib: 2 })).not.toContain("flex-row-reverse");
    expect(joy({ tartib: 0 })).toMatch(/class="[^"]*\bpr-6\b[^"]*">Tanishuv</);
    expect(joy({ tartib: 1 })).toMatch(/class="[^"]*\bpl-6\b[^"]*">Tanishuv</);
  });

  it("sits on the surface at the share the contrast test measures, with no backdrop blur, and writes only readable inks", () => {
    const html = joy({ holat: "done", izoh: "Yana mashq qilish · 14 yangi so'z" });
    expect(html).toContain(`bg-surface/${Math.round(CARD_SURFACE_ALPHA * 100)}`);
    expect(html).not.toContain("backdrop-");
    expect(html).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
    expect(html).toMatch(/text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/);
  });
});

describe("<DengizUnitLavha />", () => {
  const html = (unitTartibi?: number) =>
    renderToStaticMarkup(createElement(DengizUnitLavha, { daraja: "A1", matn: "A1 · Zahlen", unitTartibi }));

  it("is the unit's zone banner with its line, its depth and Dafi waving hello", () => {
    const h = html(2);
    expect(h).toContain("A1 · Zahlen");
    expect(h).toContain('data-lavha-zona="kelp"');
    expect(h).toContain(`background:${ZONES.kelp.banner}`);
    expect(h).toContain('data-holat="salom"');
    expect(h).toContain(`background:rgba(0, 0, 0, ${DEPTH_CHIP_ALPHA})`);
    // The depth is decoration: shown, not read out.
    expect(h).toMatch(/<span aria-hidden="true"[^>]*>25 m<\/span>/);
  });

  it("is the reef when the order is not given, and screen readers read it", () => {
    expect(html()).toContain('data-lavha-zona="marjon"');
    expect(html()).toMatch(/>5 m<\/span>/);
    expect(html(3)).toMatch(/>70 m<\/span>/);
    expect(html()).not.toMatch(/^<div[^>]*aria-hidden/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz/dengiz-orinlar.test.ts`
Expected: FAIL — `Failed to resolve import "./dengiz-joy"`.

- [ ] **Step 3: Write the node**

`D/dengiz-tugun.tsx`:

```tsx
import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";
import { SharTugun, type SharRangi } from "../sahna-qismlari";

/**
 * The orb of each state (dengiz.html `.node.done / .cur / .lock`): a pearl for
 * a finished lesson, a gold lamp for the current one, the pale frosted stone
 * for a locked one (a translucent surface, no backdrop blur — the scene moves
 * under it on every scroll frame). The level colour is not used: the sea has
 * its own light; the sticky banner still shows the level.
 */
export const SHAR: Record<TugunHolat, SharRangi> = {
  done: {
    fon: "radial-gradient(circle at 36% 30%, #ffffff, #f3e6ff 45%, #d9b8fb)",
    soya: "0 8px 20px rgba(0, 0, 0, 0.2), 0 0 26px rgba(243, 226, 255, 0.55)",
    belgi: "#5a2f8f",
  },
  active: {
    fon: "radial-gradient(circle at 36% 30%, #fffbea, #ffe48a 50%, #ffbe55)",
    soya: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 36px rgba(255, 231, 160, 0.8)",
    belgi: "#6b3f00",
  },
  locked: {
    fon: "color-mix(in srgb, var(--surface-card) 72%, transparent)",
    soya: "0 6px 18px rgba(0, 0, 0, 0.13)",
    belgi: "var(--ink-600)",
  },
};

/** The current node's breathing ring (`.dengiz-ring`): a gold halo. */
export const HALQA = "0 0 0 10px rgba(255, 231, 160, 0.55)";

/**
 * «Dengiz»'s path node: the shared orb node (`SharTugun`) in the sea's light.
 * Under «Kam harakat» the ring rests at `opacity: 0`; the current node's own
 * gold fill, its glow and the star still tell it apart.
 */
export function DengizTugun(p: TugunBelgisiProps) {
  return <SharTugun {...p} tema="dengiz" shar={SHAR} halqa={HALQA} />;
}
```

- [ ] **Step 4: Write the places**

`D/dengiz-joy.tsx`:

```tsx
import type * as React from "react";
import type { DafLessonKind } from "../../types";
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { type BelgiProps, type JoyKorinishi, SahnaJoy } from "../sahna-qismlari";
import { joyTanla } from "../sahna-umumiy";
import { ACCENT } from "./dengiz-zona";

export type DengizJoyId = "chiganoq" | "kema" | "gor" | "xazina";

/** Every lesson step's place under the sea: a new kind stops compiling here until it has one. */
const JOYLAR: Record<DafLessonKind, DengizJoyId> = {
  SECTION_A: "chiganoq",
  SECTION_B: "kema",
  BRIDGE: "gor",
  UNIT_TEST: "xazina",
};

/**
 * Which place a lesson is under the sea (spec §8): the first meeting in a
 * shell house, the practice on a sunken ship, the passage test in a cave, the
 * final test at the treasure. An old DiB lesson has no step, and a kind this
 * build does not know (the server and the client are deployed by hand) is
 * drawn too: the shell house.
 */
export function placeForKind(kind: DafLessonKind | null): DengizJoyId {
  return joyTanla(kind, JOYLAR);
}

/** A shell house with a door and a pearl (dengiz.html `shellArt`). */
function Chiganoq({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="56" rx="24" ry="5" fill="#c75a7e" opacity="0.4" />
      <path d="M8 52A24 24 0 0 1 56 52Z" fill="#ff9bb3" />
      <path d="M32 52L14 34M32 52V28M32 52L50 34" stroke="#ffc2d1" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 52V44a6 6 0 0 1 12 0V52Z" fill="#7a5aa8" />
      <circle cx="32" cy="22" r="4" fill="#ffe58a" />
    </svg>
  );
}

/** A sunken ship, listing, with a lit porthole (dengiz.html `wreckArt`). */
function Kema({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="57" rx="28" ry="4" fill="#3b6f8f" opacity="0.4" />
      <g transform="rotate(-9 32 40)">
        <path d="M32 10V40" stroke="#5a3a1e" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 13L52 36H34Z" fill="#e4dcc8" />
        <path d="M6 40H58Q55 54 40 56H22Q9 54 6 40Z" fill="#a8683a" />
        <circle cx="22" cy="47" r="3" fill="#7ffcff" />
      </g>
    </svg>
  );
}

/** A cave in a rock, with two eyes in the dark (dengiz.html `caveArt`). */
function Gor({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M2 58Q4 18 32 10Q60 18 62 58Z" fill="#7d86c4" />
      <ellipse cx="32" cy="48" rx="15" ry="14" fill="#243a86" />
      <circle cx="27" cy="46" r="2" fill="#9ffff7" />
      <circle cx="37" cy="46" r="2" fill="#9ffff7" />
      <path d="M6 58Q4 50 8 46M58 58Q62 50 56 44" stroke="#6bf5c9" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A treasure chest on the sand (dengiz.html `vaultArt` / `chestSVG`). */
function Xazina({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="57" rx="26" ry="4" fill="#d9b26a" opacity="0.5" />
      <rect x="10" y="30" width="44" height="24" rx="4" fill="#a8683a" />
      <path d="M10 30V24Q10 12 32 12Q54 12 54 24V30Z" fill="#b9753a" />
      <rect x="10" y="28" width="44" height="4" fill="#e9c46a" />
      <rect x="28" y="30" width="8" height="10" rx="2" fill="#e9c46a" />
      <circle cx="32" cy="22" r="3" fill="#7ffcff" />
    </svg>
  );
}

/** The emblem of each place: hand-drawn, still SVG (the mockup's emoji are not used, spec §14). */
export const JOY_BELGISI: Record<DengizJoyId, (p: BelgiProps) => React.JSX.Element> = {
  chiganoq: Chiganoq,
  kema: Kema,
  gor: Gor,
  xazina: Xazina,
};

/** The light behind the emblem, per state (dengiz.html `.spot.done`, `.spot.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(243, 226, 255, 0.85), rgba(243, 226, 255, 0))",
  active: "radial-gradient(closest-side, rgba(255, 228, 138, 0.85), rgba(255, 228, 138, 0))",
  locked: "radial-gradient(closest-side, rgba(120, 150, 210, 0.35), rgba(120, 150, 210, 0))",
};

/** The corner badge, per state (dengiz.html `.badge`); `dengiz-kontrast.test.ts` holds each pair to 3:1. */
export const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#e3c6ff", rang: "#4a2a7a" },
  active: { fon: "#ffe48a", rang: "#6b4500" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Murk over a locked place's emblem (dengiz.html `.fog`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(14, 34, 80, 0.7), rgba(14, 34, 80, 0.25) 70%, rgba(14, 34, 80, 0))";

const DENGIZ_JOY: JoyKorinishi = {
  nur: NUR,
  nishon: NISHON,
  tuman: TUMAN,
  accent: ACCENT,
  faolNur: "0 0 40px rgba(255, 228, 138, 0.45)",
};

/**
 * «Dengiz»: one lesson as a place under the sea (spec §8) — a shell house, a
 * ship, a cave or the treasure by the lesson's step, drawn by the shared place
 * card (`SahnaJoy`); a locked one waits in the murk.
 */
export function DengizJoy(p: UnitJoyiProps) {
  const joy = placeForKind(p.kind);
  return <SahnaJoy {...p} tema="dengiz" joy={joy} Belgi={JOY_BELGISI[joy]} korinish={DENGIZ_JOY} />;
}
```

- [ ] **Step 5: Write the unit header**

`D/dengiz-unit-lavha.tsx`:

```tsx
"use client";

import type * as React from "react";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../../dafi/dafi";
import type { UnitLavhaProps } from "../tema-turlari";
import { DEPTH_CHIP_ALPHA, ZONE_DEPTH_M, ZONES, zoneForUnit, type ZoneId } from "./dengiz-zona";

/** A small coral. */
function MarjonBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M12 21V11M12 15l-4-5M12 13l4-6" stroke="#ffe0ea" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Two kelp blades. */
function KelpBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M10 21C6 15 12 10 9 3M14 21C18 15 12 10 15 4" stroke="#d6ffd9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A lamp in the dark. */
function ChuqurBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="#bff8ff" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="#bff8ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ZONA_BELGISI: Record<ZoneId, () => React.JSX.Element> = {
  marjon: MarjonBelgisi,
  kelp: KelpBelgisi,
  chuqur: ChuqurBelgisi,
};

/**
 * «Dengiz»: the unit page's header in the unit's zone — its deep colour (white
 * text 6.0–10.4:1, `dengiz-kontrast.test.ts`), the zone's sign, the unit's
 * line, the zone's depth and Dafi waving hello. The depth is decoration
 * (`aria-hidden`, a number with the unit «m» through `t`); the line is read by
 * screen readers: it is the only place the unit's German title is shown.
 */
export function DengizUnitLavha({ matn, unitTartibi = 1 }: UnitLavhaProps) {
  const t = useT();
  const zona = zoneForUnit(unitTartibi);
  const Belgi = ZONA_BELGISI[zona];
  return (
    <div
      data-lavha-zona={zona}
      className="flex items-center gap-3 rounded-[26px] p-2 text-white shadow-[0_12px_30px_rgba(0,0,0,.18)]"
      style={{ background: ZONES[zona].banner }}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
        <Belgi />
      </span>
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <span
        aria-hidden
        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums"
        style={{ background: `rgba(0, 0, 0, ${DEPTH_CHIP_ALPHA})` }}
      >
        {t("{n} m", { n: ZONE_DEPTH_M[zona] })}
      </span>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz/dengiz-orinlar.test.ts`
Expected: PASS.

- [ ] **Step 7: Translate the depth's unit**

Avval: `grep -n '"{n} m"' client/src/i18n/dictionaries/ru.ts` — bo'sh bo'lishi kerak (kalit yangi).

`client/src/i18n/dictionaries/ru.ts` — Old:

```ts
};

export default ru;
```

New:

```ts
  "{n} m": "{n} м",
};

export default ru;
```

`client/src/i18n/dictionaries/de.ts` — Old:

```ts
};

export default de;
```

New:

```ts
  "{n} m": "{n} m",
};

export default de;
```

`client/src/i18n/dictionaries/en.ts` — Old:

```ts
};

export default en;
```

New:

```ts
  "{n} m": "{n} m",
};

export default en;
```

`client/src/i18n/i18n-coverage.test.ts` — Old:

```ts
  "components/student-portal/lernen/tema/sahna-qismlari.tsx",
```

New:

```ts
  "components/student-portal/lernen/tema/sahna-qismlari.tsx",
  "components/student-portal/lernen/tema/dengiz/dengiz-unit-lavha.tsx",
```

Run: `cd client && npm run i18n:check`
Expected: PASS (yangi `"{n} m"` uch lug'atda, o'rinbosarlar teng, eskirgan kalit yo'q).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/dengiz/dengiz-tugun.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-joy.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-unit-lavha.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-orinlar.test.ts client/src/i18n/i18n-coverage.test.ts client/src/i18n/dictionaries/ru.ts client/src/i18n/dictionaries/de.ts client/src/i18n/dictionaries/en.ts
git commit -m "feat(lernen): the Dengiz node, places under the sea and the unit header

Pearl, gold and frosted-stone orbs; a shell house, a ship, a cave and the
treasure through the shared place card, locked ones in the murk; the
header shows the zone's depth as a decorative chip.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — mukofot foni, miniatyura, temaning yig'masi, reyestr va kontrast

**Files:**
- Create: `D/dengiz-tema.tsx`
- Test: `D/dengiz-tema.test.ts`, `D/dengiz-kontrast.test.ts`
- Modify: `T/tema-reyestri.ts`, `T/tema-reyestri.test.ts`
- Modify: `client/src/components/student-portal/lernen-tema-rasmi.test.ts`
- Modify: `client/src/app/globals.css` (`--dengiz-*` tokenlari `.lumio` va `.dark .lumio` da)

**Interfaces:**
- Consumes: `SahnaMukofotFoni` (Task 1); `DengizSahna` (Task 3); `DengizTugun`, `SHAR`, `DengizJoy`, `NISHON`, `DengizUnitLavha` (Task 5); `ZONES`, `ACCENT`, `DARK_VEIL`, `DEPTH_CHIP_ALPHA`, `TUBE_STEM`, `ZONE_IDS` (Task 2); `CARD_SURFACE_ALPHA` (Task 1); `cssHexToken`, `hexContrast`, `mixHex` (`client/src/test-support/hex-contrast.ts`); `LernenTema`, `MukofotFoniProps`.
- Produces: `DengizMukofotFoni(p: MukofotFoniProps)` (`data-mukofot="dengiz"`), `DengizMiniatyura()` (`<svg data-miniatyura="dengiz">`, `id="dengiz-miniatyura-suv"`), `dengizTema: LernenTema`; `TEMALAR.dengiz`; tokenlar `--dengiz-mukofot-ust`, `--dengiz-mukofot-ost`, `--dengiz-tepalik`, `--dengiz-mukofot-nur`.

- [ ] **Step 1: Write the failing tests**

`D/dengiz-tema.test.ts`:

```ts
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { temaTop } from "../tema-reyestri";
import { DengizMiniatyura, DengizMukofotFoni, dengizTema } from "./dengiz-tema";

// `children` is the third argument (react/no-children-prop); the cast keeps `tsc`
// from asking for it in the props.
const foni = (bayram: boolean) =>
  renderToStaticMarkup(
    createElement(DengizMukofotFoni, { bayram } as ComponentProps<typeof DengizMukofotFoni>, "Dars tugadi!"),
  );

/** Every opening `<div …>` tag of the markup, in document order. */
const divTags = (html: string) => html.match(/<div\b[^>]*>/g) ?? [];

describe("<DengizMukofotFoni />", () => {
  it("is clear shallow water over the sand, drawn in the theme's tokens", () => {
    const html = foni(false);
    expect(html).toContain('data-mukofot="dengiz"');
    expect(html).toContain("Dars tugadi!");
    expect(html).toContain("var(--dengiz-mukofot-ust)");
    expect(html).toContain("var(--dengiz-tepalik)");
  });

  it("turns slow light rays only for a celebration", () => {
    expect(foni(true)).toContain("dengiz-burst");
    expect(foni(true)).toContain("var(--dengiz-mukofot-nur)");
    expect(foni(false)).not.toContain("dengiz-burst");
    expect(foni(false)).not.toContain("var(--dengiz-mukofot-nur)");
  });

  for (const bayram of [false, true]) {
    it(`clips only a decoration layer behind the content, never the content path (bayram=${bayram})`, () => {
      const html = foni(bayram);
      // Dafi's celebration hops lift it above the card; a clip on the root or on
      // the content wrapper would crop its ears at the peaks.
      const clipped = divTags(html).filter((tag) => tag.includes("overflow-hidden"));
      expect(clipped, "exactly one element clips").toHaveLength(1);
      expect(clipped[0]).toContain('aria-hidden="true"');
      expect(clipped[0]).toContain("pointer-events-none");
      const holder = /<div\b([^>]*)>Dars tugadi!<\/div>/.exec(html);
      expect(holder, "the children sit directly in one wrapper").not.toBeNull();
      expect(holder?.[1]).not.toContain("overflow");
      expect(holder?.[1]).toMatch(/class="[^"]*\brelative\b[^"]*"/);
      expect(divTags(html)[0]).toContain('data-mukofot="dengiz"');
      expect(divTags(html)[0]).not.toContain("overflow");
      expect(html.indexOf(clipped[0])).toBeLessThan(html.indexOf("Dars tugadi!"));
    });
  }
});

// One scene per document (ADR-0132): the card picture is its own static SVG and
// never reuses the scene's layers or ids.
describe("<DengizMiniatyura />", () => {
  it("is a still, small picture of its own: no scene layer, no moving part, its own gradient id", () => {
    const html = renderToStaticMarkup(createElement(DengizMiniatyura));
    expect(html).toMatch(/^<svg data-miniatyura="dengiz"[^>]*aria-hidden="true"/);
    expect(html).toContain('id="dengiz-miniatyura-suv"');
    expect(html).not.toContain("data-omil");
    expect(html).not.toContain("<use");
    expect(html).not.toMatch(/dengiz-(?:strip|zone|sway|bubble|school|rays)/);
    expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(15);
  });
});

describe("the «Dengiz» theme", () => {
  it("is in the registry and brings every slot, its scene and card picture included", () => {
    expect(temaTop("dengiz")).toBe(dengizTema);
    expect(dengizTema.id).toBe("dengiz");
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna", "Miniatyura"] as const) {
      expect(dengizTema[slot], slot).toBeTruthy();
    }
  });
});
```

`D/dengiz-kontrast.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "@/test-support/hex-contrast";
import { CARD_SURFACE_ALPHA } from "../sahna-umumiy";
import { NISHON } from "./dengiz-joy";
import { SHAR } from "./dengiz-tugun";
import { ACCENT, DARK_VEIL, DEPTH_CHIP_ALPHA, TUBE_STEM, ZONE_IDS, ZONES } from "./dengiz-zona";

// Read from the stylesheet, the palette and the components' own colour tables
// (`NISHON`, `SHAR`), so a token or a colour change that breaks the contrast
// fails here instead of on a student's phone.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MODES = [
  { name: "light", selector: ".lumio", scene: (c: string) => c },
  { name: "dark", selector: ".dark .lumio", scene: (c: string) => mixHex(DARK_VEIL.color, c, DARK_VEIL.alpha) },
] as const;

/** Every colour the scene paints: the water, ridges, walls, decor and fish of each zone, the tubes' stems, the white of bubbles and tips. */
const sceneColours = [
  ...ZONE_IDS.flatMap((id) => {
    const p = ZONES[id];
    return [p.top, p.mid, p.bottom, p.ridge, p.rock, ...p.decor, p.fish];
  }),
  TUBE_STEM,
  "#ffffff",
];

/** A `var(--token)` colour as the mode's hex; a hex stays as it is. */
const hexOf = (value: string, selector: string) => {
  const token = /^var\(--([a-z0-9-]+)\)$/.exec(value)?.[1];
  return token ? cssHexToken(css, selector, token) : value;
};

// Text is held to 4.5:1 (spec §11); an icon is not text, its standard is 3:1.
const TEXT = 4.5;
const ICON = 3;

describe("the place card's text over the sea (spec §11: 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: the name, the dark ink and the words-left caption hold over every scene colour`, () => {
      const surface = cssHexToken(css, mode.selector, "surface-card");
      for (const c of sceneColours) {
        const card = mixHex(surface, mode.scene(c), CARD_SURFACE_ALPHA);
        for (const token of ["ink-900", "ink-600", "amber-ink"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), card),
            `${mode.name}: ${token} on the card over ${c}`,
          ).toBeGreaterThanOrEqual(TEXT);
        }
      }
    });
  }
});

describe("the sea's own coloured labels", () => {
  it("the unit banner's white text holds on every zone's banner, and on the darker depth chip", () => {
    for (const id of ZONE_IDS) {
      expect(hexContrast("#ffffff", ZONES[id].banner), id).toBeGreaterThanOrEqual(TEXT);
      expect(hexContrast("#ffffff", mixHex("#000000", ZONES[id].banner, DEPTH_CHIP_ALPHA)), `${id}: chip`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it("the «Boshlash» pill's white text holds on the accent", () => {
    expect(hexContrast("#ffffff", ACCENT)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("the state glyphs (icons, not text: 3:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: the place card's corner badges hold`, () => {
      for (const [holat, { fon, rang }] of Object.entries(NISHON)) {
        expect(hexContrast(hexOf(rang, mode.selector), hexOf(fon, mode.selector)), `${mode.name}: ${holat}`).toBeGreaterThanOrEqual(ICON);
      }
    });

    it(`${mode.name}: the lock on the frosted-stone node holds over every scene colour`, () => {
      // `SHAR.locked.fon` is `color-mix(in srgb, var(--surface-card) NN%, transparent)`: the surface token and its share over the scene.
      const stone = /var\(--([a-z0-9-]+)\)\s+(\d+)%/.exec(SHAR.locked.fon);
      if (!stone) throw new Error(`SHAR.locked.fon is no longer a surface token at some %: ${SHAR.locked.fon}`);
      const surface = cssHexToken(css, mode.selector, stone[1]);
      const share = Number(stone[2]) / 100;
      const lock = hexOf(SHAR.locked.belgi, mode.selector);
      for (const c of sceneColours) {
        expect(hexContrast(lock, mixHex(surface, mode.scene(c), share)), `${mode.name}: the stone over ${c}`).toBeGreaterThanOrEqual(ICON);
      }
    });
  }

  it("the pearl and the gold orbs keep their glyph readable at every stop of the gradient", () => {
    for (const holat of ["done", "active"] as const) {
      const { fon, belgi } = SHAR[holat];
      const stops = fon.match(/#[0-9a-f]{6}/gi) ?? [];
      expect(stops.length, `${holat}: no gradient stops found in ${fon}`).toBeGreaterThanOrEqual(2);
      for (const stop of stops) expect(hexContrast(belgi, stop), `${holat}: ${belgi} on ${stop}`).toBeGreaterThanOrEqual(ICON);
    }
  });
});

describe("the reward background (the result's ink-900 heading and ink-600 line, 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: both hold on the water, its edge, the sand and under the rays`, () => {
      const esc = mode.selector.replace(/\./g, "\\.");
      const block = css.match(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
      const nur = block.match(/--dengiz-mukofot-nur:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (!nur) throw new Error(`--dengiz-mukofot-nur not found in ${mode.selector}`);
      const [r, g, b, a] = nur.slice(1).map(Number);
      const nurHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const ust = cssHexToken(css, mode.selector, "dengiz-mukofot-ust");
      const grounds = [
        ust,
        cssHexToken(css, mode.selector, "dengiz-mukofot-ost"),
        cssHexToken(css, mode.selector, "dengiz-tepalik"),
        mixHex(nurHex, ust, a),
      ];
      for (const ground of grounds) {
        for (const token of ["ink-900", "ink-600"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), ground),
            `${mode.name}: ${token} on ${ground}`,
          ).toBeGreaterThanOrEqual(TEXT);
        }
      }
    });
  }
});
```

`T/tema-reyestri.test.ts` — Old:

```ts
  it("«Toza» draws no scene: the plain app background stays", () => {
    expect(temaTop("toza").Sahna).toBeUndefined();
  });
});
```

New:

```ts
  it("«Toza» draws no scene: the plain app background stays", () => {
    expect(temaTop("toza").Sahna).toBeUndefined();
  });

  it("resolves «dengiz» to its own theme with a scene; «alp» is still drawn as «Toza» (ADR-0133)", () => {
    expect(temaTop("dengiz").id).toBe("dengiz");
    expect(temaTop("dengiz").Sahna).toBeDefined();
    expect(temaTop("alp").id).toBe("toza");
  });
});
```

`client/src/components/student-portal/lernen-tema-rasmi.test.ts` — Old:

```ts
  it("falls back to the colour dot for a look without a miniature", () => {
    const toza = render("toza");
    expect(toza).toContain("background:#ff6b4a");
    expect(toza).not.toContain("data-miniatyura");
    // A look that is not built yet resolves to Toza in the registry and shows its own dot.
    const dengiz = render("dengiz", "#0ea5e9");
    expect(dengiz).toContain("background:#0ea5e9");
    expect(dengiz).not.toContain("data-miniatyura");
  });

  it("is decorative and every card's picture takes the same cell", () => {
    for (const id of ["toza", "ormon", "dengiz"] as const) {
```

New:

```ts
  it("draws «Dengiz»'s own miniature too (ADR-0133)", () => {
    const html = render("dengiz", "#2b78a8");
    expect(html).toContain('data-miniatyura="dengiz"');
    expect(html).not.toContain("background:#2b78a8");
  });

  it("falls back to the colour dot for a look without a miniature", () => {
    const toza = render("toza");
    expect(toza).toContain("background:#ff6b4a");
    expect(toza).not.toContain("data-miniatyura");
    // A look that is not built yet («Nemis sayohati») resolves to Toza in the registry and shows its own dot.
    const alp = render("alp", "#8b5cf6");
    expect(alp).toContain("background:#8b5cf6");
    expect(alp).not.toContain("data-miniatyura");
  });

  it("is decorative and every card's picture takes the same cell", () => {
    for (const id of ["toza", "ormon", "dengiz", "alp"] as const) {
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema src/components/student-portal/lernen-tema-rasmi.test.ts`
Expected: FAIL — `Failed to resolve import "./dengiz-tema"`; `temaTop("dengiz").id` = `"toza"`; `--dengiz-mukofot-nur not found in .lumio`; rasmi: `data-miniatyura="dengiz"` yo'q.

- [ ] **Step 3: Write the reward, the miniature and the theme**

`D/dengiz-tema.tsx`:

```tsx
import type { LernenTema, MukofotFoniProps } from "../tema-turlari";
import { SahnaMukofotFoni } from "../sahna-qismlari";
import { DengizJoy } from "./dengiz-joy";
import { DengizSahna } from "./dengiz-sahna";
import { DengizTugun } from "./dengiz-tugun";
import { DengizUnitLavha } from "./dengiz-unit-lavha";
import { ZONES } from "./dengiz-zona";

/**
 * «Dengiz»: the reward stands in clear shallow water over the sand
 * (dengiz.html `.reward`, pale so the result's text keeps 4.5:1) — the shared
 * reward background in the `--dengiz-*` tokens, with slow light rays for a
 * celebration. The mockup's chest is not drawn: Dafi and the confetti are the
 * celebration, and they are not the theme's.
 */
export function DengizMukofotFoni(p: MukofotFoniProps) {
  return <SahnaMukofotFoni {...p} tema="dengiz" />;
}

/**
 * «Dengiz»'s picture on its card in the look dialog (spec §7): a still dive
 * from the reef to the deep, two walls, two bubbles and a lit node. Its own
 * static SVG with its own gradient id: only ONE scene may stand in a document
 * (ADR-0132), so it never reuses the scene's parts.
 */
export function DengizMiniatyura() {
  return (
    <svg data-miniatyura="dengiz" viewBox="0 0 56 40" className="h-10 w-14" aria-hidden="true">
      <defs>
        <linearGradient id="dengiz-miniatyura-suv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ZONES.marjon.top} />
          <stop offset="1" stopColor={ZONES.chuqur.bottom} />
        </linearGradient>
      </defs>
      <rect width="56" height="40" rx="10" fill="url(#dengiz-miniatyura-suv)" />
      <path d="M0 6Q8 14 4 24T6 40H0Z" fill={ZONES.marjon.rock} />
      <path d="M56 10Q48 18 52 28T50 40H56Z" fill={ZONES.kelp.rock} />
      <circle cx="16" cy="11" r="2" fill="#ffffff" opacity="0.7" />
      <circle cx="40" cy="18" r="1.5" fill="#ffffff" opacity="0.7" />
      <circle cx="28" cy="26" r="9" fill="#ffe7a0" opacity="0.4" />
      <circle cx="28" cy="26" r="6" fill="#ffbe55" />
    </svg>
  );
}

/** «Dengiz» (spec §8, ADR-0133): a dive in three zones, built cheaper than «O'rmon». */
export const dengizTema: LernenTema = {
  id: "dengiz",
  TugunBelgisi: DengizTugun,
  MukofotFoni: DengizMukofotFoni,
  UnitLavha: DengizUnitLavha,
  UnitJoyi: DengizJoy,
  Sahna: DengizSahna,
  Miniatyura: DengizMiniatyura,
};
```

`T/tema-reyestri.ts` — Old:

```ts
import { ormonTema } from "./ormon/ormon-tema";
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
  ormon: ormonTema,
};
```

New:

```ts
import { dengizTema } from "./dengiz/dengiz-tema";
import { ormonTema } from "./ormon/ormon-tema";
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
  ormon: ormonTema,
  dengiz: dengizTema,
};
```

- [ ] **Step 4: Add the reward tokens**

`client/src/app/globals.css` (`.lumio` bloki) — Old:

```css
  --ormon-mukofot-nur: rgba(255, 255, 255, 0.35);

  /* --- Radii --- */
```

New:

```css
  --ormon-mukofot-nur: rgba(255, 255, 255, 0.35);

  /* «Dengiz» theme's reward background (ADR-0133): clear shallow water
     over the sand in light mode, the deep sea in dark mode; the shared
     reward calls its ground «tepalik». dengiz-kontrast.test.ts measures
     them. Plain custom properties, not Tailwind colour names. */
  --dengiz-mukofot-ust: #f2fbff;
  --dengiz-mukofot-ost: #d6eefa;
  --dengiz-tepalik: #f1e2c4;
  --dengiz-mukofot-nur: rgba(255, 255, 255, 0.35);

  /* --- Radii --- */
```

`client/src/app/globals.css` (`.dark .lumio` bloki) — Old:

```css
  --ormon-mukofot-nur: rgba(255, 241, 196, 0.03);

  /* Neutral clay lips must read DARKER than the surface in dark mode. */
```

New:

```css
  --ormon-mukofot-nur: rgba(255, 241, 196, 0.03);

  --dengiz-mukofot-ust: #123a52;
  --dengiz-mukofot-ost: #0b2438;
  --dengiz-tepalik: #2a3328;
  --dengiz-mukofot-nur: rgba(255, 241, 196, 0.03);

  /* Neutral clay lips must read DARKER than the surface in dark mode. */
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema src/components/student-portal/lernen-tema-rasmi.test.ts src/app/globals-css.test.ts`
Expected: PASS. Kontrast (reja vaqtida hisoblangan): kartadagi matn yorug'da ≥ 4.91, qorong'uda ≥ 6.00; qulf toshi ≥ 4.09 / 4.59; lavha oq matni 6.05 / 6.40 / 10.39; urg'u 7.01; mukofot yorug'da ≥ 5.14, qorong'uda ≥ 5.58.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/dengiz/dengiz-tema.tsx client/src/components/student-portal/lernen/tema/dengiz/dengiz-tema.test.ts client/src/components/student-portal/lernen/tema/dengiz/dengiz-kontrast.test.ts client/src/components/student-portal/lernen/tema/tema-reyestri.ts client/src/components/student-portal/lernen/tema/tema-reyestri.test.ts client/src/components/student-portal/lernen-tema-rasmi.test.ts client/src/app/globals.css
git commit -m "feat(lernen): assemble the Dengiz theme, its reward and card picture

The reward is the shared background in --dengiz-* tokens; the miniature
is its own static SVG; the registry resolves dengiz, alp stays Toza; the
contrast test measures every text and glyph from the real tokens.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — «Dengiz» tanlashga ochiladi, sahifa testlari, ADR-0133 va hujjatlar

**Files:**
- Modify: `client/src/lib/lernen-temalar.ts`, `client/src/lib/lernen-temalar.test.ts`
- Modify (faqat yangi bloklar): `L/lernen-levels-page.test.ts`, `L/lernen-unit-page.test.ts`
- Create: `docs/adr/0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md`
- Modify: `docs/adr/README.md`, `client/CLAUDE.md`

**Interfaces:**
- Consumes: `TEMALAR.dengiz` (Task 6); sahifalarning mavjud simlari (`SahnaRamka`, `joriyUnitTartibi`, `unitTartibi={data?.order ?? 1}`); `SAHNA_PARDASI`, `SAHNA_PARDASI_KICHIK` (`T/sahna-ramka.tsx`).
- Produces: `TAYYOR_TEMALAR` → `["toza", "ormon", "dengiz"]`; Sozlamalar → «Ta'lim ko'rinishi» da Dengiz kartasi tanlanadi; ADR-0133.

- [ ] **Step 1: Write the failing tests**

`client/src/lib/lernen-temalar.test.ts` — Old:

```ts
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza", "ormon"]);
```

New:

```ts
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza", "ormon", "dengiz"]);
```

`L/lernen-levels-page.test.ts` — fayl OXIRIGA (mavjud bloklar o'zgarmaydi):

```ts
describe("the path page in the «Dengiz» look (ADR-0133)", () => {
  it("stands the dive while the path is still loading, in the first zone: no gaps (spec §10)", () => {
    const h = render({ tema: "dengiz" });
    expect(h).toContain('data-sahna="dengiz"');
    expect(h).toMatch(/data-zona="marjon" data-faol=""/);
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  it("draws the sea nodes and puts the page's own text on plates, in the readable ink", () => {
    const h = render({ tema: "dengiz", levels: LEVELS });
    expect(h).toContain('data-tugun="dengiz"');
    const plates = (h.match(/<[a-z0-9]+ [^>]*>/g) ?? []).filter(
      (tag) => tag.includes(SAHNA_PARDASI) || tag.includes(SAHNA_PARDASI_KICHIK),
    );
    expect(plates.length, "no plate found").toBeGreaterThanOrEqual(4);
    for (const tag of plates) expect(tag).not.toMatch(/\btext-ink-(?:400|500)\b/);
  });
});
```

`L/lernen-unit-page.test.ts` — fayl OXIRIGA (mavjud bloklar o'zgarmaydi):

```ts
// ADR-0133: «Dengiz» stands the unit's zone behind the page and draws the
// lessons as places under the sea, through the same page wiring as «O'rmon».
async function dengizHtml(order = unit.order): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => ({ ...unit, order }) });
  client.setQueryData(["student-portal", "profile"], { lernenTema: "dengiz" });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(LernenUnitPage, { unitId: 7 })),
  );
}

describe("the unit page in the «Dengiz» look (ADR-0133)", () => {
  it("stands the unit's zone in a frame behind the content (unit 4: the reef again)", async () => {
    const h = await dengizHtml();
    expect(h).toContain('data-sahna="dengiz"');
    expect(h).toMatch(/data-zona="marjon" data-faol=""/);
    expect(h).toContain("pointer-events-none fixed inset-0 -z-10");
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  it.each([
    [2, "kelp"],
    [3, "chuqur"],
  ] as const)("follows the unit's order: unit %i stands the %s zone in the scene and on the header", async (order, zona) => {
    const h = await dengizHtml(order);
    expect(h).toContain(`data-zona="${zona}" data-faol=""`);
    expect(h).not.toContain('data-zona="marjon" data-faol=""');
    expect(h).toContain(`data-lavha-zona="${zona}"`);
  });

  it("draws each lesson as its place under the sea", async () => {
    const h = await dengizHtml();
    expect(h).toContain('data-joy="chiganoq"');
    expect(h).toContain('data-joy="kema"');
    expect(h).toContain('data-joy="gor"');
    expect(h).toContain('data-lavha-zona="marjon"');
  });

  it("gives the same lock answers: «Boshlash» once, two closed places", async () => {
    const h = await dengizHtml();
    expect(h.replace(/<[^>]*>/g, " ").match(/Boshlash/g)).toHaveLength(1);
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(h).toContain("Tanishuv — hali ochilmagan");
  });

  it("puts the page's own text on plates and uses no unreadable ink", async () => {
    const h = await dengizHtml();
    expect(h).toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
  });
});
```

- [ ] **Step 2: Run to verify which fail**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts src/components/student-portal/lernen/lernen-levels-page.test.ts src/components/student-portal/lernen/lernen-unit-page.test.ts`
Expected: `lernen-temalar.test.ts` FAIL (`["toza", "ormon"]`); sahifa testlarining Dengiz bloklari PASS (reyestr Task 6 da ulangan — sahifalar o'zgarmasdan Dengizni chizishini qotiradi); sahifalarning mavjud O'rmon va Toza bloklari PASS.

- [ ] **Step 3: Offer the look**

`client/src/lib/lernen-temalar.ts` — Old:

```ts
  { id: "dengiz", label: msg("Dengiz"), hint: msg("Suv osti dunyosi"), swatch: "#2b78a8", tayyor: false },
```

New:

```ts
  { id: "dengiz", label: msg("Dengiz"), hint: msg("Suv osti dunyosi"), swatch: "#2b78a8", tayyor: true },
```

- [ ] **Step 4: Verify the server needs nothing**

Run: `grep -n "LERNEN_TEMA_IDLARI = " server/src/common/lernen-temalar.ts`
Expected: `export const LERNEN_TEMA_IDLARI = ['toza', 'ormon', 'dengiz', 'alp'] as const;` — `dengiz` bor, server o'zgarmaydi.

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts src/components/student-portal src/i18n`
Expected: PASS (klient↔server nusxa testi yashil; `"Dengiz"`, `"Suv osti dunyosi"` lug'atlarda bor).

- [ ] **Step 6: Write ADR-0133**

Avval raqamni tekshiring: `git fetch origin && git ls-tree origin/main --name-only docs/adr/ | tail -3` va `grep -n "^| \[013" docs/adr/README.md`. Reja vaqtida (2026-10-27) eng oxirgisi 0132 — shuning uchun 0133. `main` da 0133 band bo'lsa: keyingi bo'sh raqamni oling va fayl nomi, sarlavha, README qatori, `client/CLAUDE.md` dagi havola va kod izohlaridagi «ADR-0133» ni (`grep -rn "ADR-0133" client/src docs`) shunga moslang. Qabul qilingan ADR tahrir qilinmaydi — faqat README ga qator qo'shiladi.

`docs/adr/0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md`:

```markdown
# ADR-0133 — Ta'lim «Dengiz» temasi: arzon sahna (bitta tor harakatlanuvchi qatlam) va sahnali temalar uchun umumiy qismlar

**Holati:** Qabul qilindi
**Sana:** 2026-10-27
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§5, §7, §8, §9, §11, §12), `docs/superpowers/plans/2026-10-27-lernen-dengiz-tema.md`, ADR-0125, ADR-0128, ADR-0131, ADR-0132

## Kontekst

Ta'lim dizaynining 4-bosqichi — «Dengiz» temasi (CEO tasdiqlagan mockup `docs/superpowers/mockups/2026-10-24-lernen-dizayn/dengiz.html`): sho'ng'ish, marjon rifi → kelp o'rmoni → chuqur dengiz, pufakchalar, baliqlar; unit sahifasida chig'anoq uyi, kema, g'or, xazina. 3-bosqich o'lchovida (CPU 4× sekinlashtirilgan, dasturiy chizish) O'rmonning to'liq sahnasi skrollda ~30 kadr/s berdi (Toza ~60): narx uchta to'liq ekranli xira qatlamning parallaksida edi. Shu bilan birga O'rmon fayllarida temaga bog'liq bo'lmagan mantiq bor edi: tugun, joy kartasi, mukofot foni, darsning joyini tanlash, unit tsikli, seed'li tasodif.

## Qaror

1. **Arzon sahna:** har zona — qotgan suv gradienti va qotgan tog' tizmalari; yagona harakatlanuvchi qatlam — chetlardagi ikki tor (96 px) qoya tasmasi (640 px plitka + `<use>`, ADR-0132 dagi aylanuvchi siljish); pufakcha, baliq to'dasi, tebranuvchi o'simlik va nur faqat `transform`/`opacity` bilan. CSS va SVG `filter`, `mix-blend-mode`, `feTurbulence` yo'q; `will-change` faqat ko'rinayotgan zona tasmalarida. Sahnada ≤ 300 element (spec chegarasi 1500). To'liq, yengil va «Kam harakat» rejimlaridagi sonlar `dengizPlan` da.
2. **Zona unit tartibidan:** `zoneForUnit` — marjon, kelp, chuqur, yana marjon (O'rmon biomlari bilan bitta `unitCycleIndex`). Yo'lda sahna ko'rinayotgan unitga 250 ms dan keyin ergashadi, unit sahifasida zona qotgan. Sahifalar o'zgarmadi.
3. **Chuqurlik — qotgan belgi:** zona chuqurligi («5 m», «25 m», «70 m») unit lavhasida, `t("{n} m")`, ekran o'quvchidan yashirin. Skrollga ergashuvchi o'lchagich qurilmadi.
4. **Umumiy qismlar:** `tema/sahna-umumiy.ts` (`unitCycleIndex`, `seededRandom`, `TILE`, `TILE_COPIES`, `CARD_SURFACE_ALPHA`, `joyTanla`) va `tema/sahna-qismlari.tsx` (`SharTugun`, `SahnaJoy`, `SahnaMukofotFoni`; tema id'si `<id>-ring`, `<id>-bob`, `<id>-burst` sinflarini va `--<id>-mukofot-*`, `--<id>-tepalik` tokenlarini nomlaydi). O'rmon ularning o'ramiga aylandi, markup'i bayt-ma-bayt o'zgarmadi.
5. **Noma'lum dars turi:** har tema `joyTanla` ga `Record<DafLessonKind, J>` beradi (yangi tur kompilyatsiyani to'xtatadi); ishlash vaqtida noma'lum tur (server va klient alohida deploy qilinadi) va eski DiB darsi birinchi bosqichning joyini oladi.
6. **Unumdorlik chegarasi** (keyingi sahnali temalar uchun ham): CPU 4× va 4 soniyalik skroll o'lchovida to'liq rejimning kadr medianasi (p50) ≤ 20 ms; yengil va «Kam harakat» rejimlari Toza darajasida (p50 ≤ 1.1 × Toza). Dengizning o'lchov jadvali PR tavsifida.
7. **Tanlash:** `dengiz` — `tayyor: true`, kartada o'z statik `Miniatyura` si; «Tez orada» endi faqat «Nemis sayohati». Server ro'yxati o'zgarmadi.

## Rad etilgan yo'llar

- **O'rmon qurilishini takrorlash** (uchta to'liq ekranli xira qatlam): o'lchangan narxi ikki baravar.
- **Skrollga ergashuvchi chuqurlik o'lchagichi** (mockupdagi «3 m → 85 m»): har kadr matn yozish (layout va paint), yo'l ustidagi qotgan element uchun shartnomada o'rin yo'q.
- **Kaustika (`feTurbulence`), sirt to'lqinlari, meduza va plankton:** filtrli yoki ko'p elementli bezak, byudjetdan chiqadi.
- **Har temada tugun, joy kartasi va mukofot fonining nusxasi:** ko'rik tuzatishlari (qulf semantikasi, nishon chetidagi joy, faqat bezak qatlamini kesish) temalar orasida ajralib ketardi.

## Oqibatlar

- 5-bosqich («Nemis sayohati») `sahna-qismlari.tsx` va `sahna-umumiy.ts` ni oladi va faqat palitra, reja, bezak va CSS beradi; uning `.alp-*` qoidalari `globals-css.test.ts` dagi `SCENE_THEMES` ga bitta qator bilan skanerga qo'shiladi.
- Dengiz fayllari `tema/dengiz/`, tokenlar `--dengiz-*` `.lumio` va `.dark .lumio` ichida, harakat `.dengiz-*` sinflarida.
- Qabul qilingan cheklovlar: keng ekranda o'rta qism faqat suv, tizma, nur, pufakcha va baliqdan iborat (qoyalar chetlarda); 1920 px dan baland oynada tasmalar tugaydi (ADR-0132 dagi kabi, kerak bo'lsa `TILE_COPIES` oshiriladi).
```

- [ ] **Step 7: Add the ADR to the index**

`docs/adr/README.md` — Old (jadvalning hozirgi oxirgi qatori; `main` dan yangisi kelgan bo'lsa — haqiqiy oxirgi qatorni oling):

```markdown
| [0132](0132-lernen-ormon-tema-sahna-va-joy-orinlari.md) | Ta'lim «O'rmon» temasi: `LernenTema` ga `UnitJoyi`, `Sahna`, `Miniatyura`; sahnani sahifa `SahnaRamka` da chizadi (fixed, yon paneldan chiqib, yuklanayotganda ham); biom unit tartibidan; faqat transform/opacity, bitta rAF, yashirin/ekrandan tashqarida pauza, zaif qurilmada yarmi, ≤ 1500 element; sahna ustida `backdrop-filter` yo'q, hujjatda bitta sahna; sahnadagi umumiy matn parda ustida | Qabul qilindi | 2026-10-26 |
```

New:

```markdown
| [0132](0132-lernen-ormon-tema-sahna-va-joy-orinlari.md) | Ta'lim «O'rmon» temasi: `LernenTema` ga `UnitJoyi`, `Sahna`, `Miniatyura`; sahnani sahifa `SahnaRamka` da chizadi (fixed, yon paneldan chiqib, yuklanayotganda ham); biom unit tartibidan; faqat transform/opacity, bitta rAF, yashirin/ekrandan tashqarida pauza, zaif qurilmada yarmi, ≤ 1500 element; sahna ustida `backdrop-filter` yo'q, hujjatda bitta sahna; sahnadagi umumiy matn parda ustida | Qabul qilindi | 2026-10-26 |
| [0133](0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md) | Ta'lim «Dengiz» temasi: yagona harakatlanuvchi qatlam — chetdagi ikki tor qoya tasmasi, filtr va blend yo'q, ≤ 300 element; zona unit tartibidan, chuqurlik lavhada qotgan belgi; tugun, joy kartasi, mukofot foni va sof yordamchilar sahnali temalar uchun umumiy (`sahna-qismlari`, `sahna-umumiy`); noma'lum dars turi birinchi joyni oladi; unumdorlik chegarasi CPU 4× da | Qabul qilindi | 2026-10-27 |
```

- [ ] **Step 8: Update client/CLAUDE.md («Ta'lim look» paragraph)**

`client/CLAUDE.md` — Old:

```markdown
O'rmon (`tema/ormon/`): three biomes (`biomeForUnit`: tong, ko'l, kuz by the unit's order), its reward tokens `--ormon-*` in `.lumio` and `.dark .lumio`, its motion in the `.ormon-*` classes of `globals.css`.
```

New:

```markdown
O'rmon (`tema/ormon/`): three biomes (`biomeForUnit`: tong, ko'l, kuz by the unit's order), its reward tokens `--ormon-*` in `.lumio` and `.dark .lumio`, its motion in the `.ormon-*` classes of `globals.css`. Dengiz (`tema/dengiz/`, ADR-0133) is the second scene and is built cheaper by design: three zones by the unit's order (`zoneForUnit`: marjon, kelp, chuqur), each a still water gradient with still ridges, and the scene's only moving layer is two 96 px rock strips at the edges (`dengiz-strip`), never a full-screen layer; bubbles, fish and two swaying fronds move by transform and opacity, nothing is filtered or blended, at most 300 elements (`ELEMENT_BUDGET`); the zone's depth is a still, decorative chip on the unit header (`t("{n} m")`), not a live gauge. The node, the place card and the reward are shared by the scene themes (`tema/sahna-qismlari.tsx`: `SharTugun`, `SahnaJoy`, `SahnaMukofotFoni`, which take the theme id for their `<id>-ring`, `<id>-bob`, `<id>-burst` classes and `--<id>-mukofot-*` tokens), and so are the pure helpers in `tema/sahna-umumiy.ts` (`unitCycleIndex`, `seededRandom`, `TILE`, `TILE_COPIES`, `joyTanla`: an unknown lesson kind gets the first lesson's place); O'rmon's files are thin wrappers over them. `globals-css.test.ts` scans every scene theme's rules (`SCENE_THEMES`).
```

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/lernen-temalar.ts client/src/lib/lernen-temalar.test.ts client/src/components/student-portal/lernen/lernen-levels-page.test.ts client/src/components/student-portal/lernen/lernen-unit-page.test.ts docs/adr/0133-lernen-dengiz-tema-arzon-sahna-va-umumiy-qismlar.md docs/adr/README.md client/CLAUDE.md
git commit -m "feat(lernen): offer the Dengiz look in Settings

The path and unit pages draw it through their existing scene wiring; the
page tests pin that. ADR-0133: the cheaper scene, the shared scene parts
and the performance bar; client/CLAUDE.md follows.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tekshiruv — skroll unumdorligini o'lchash (Toza, O'rmon, Dengiz) va qabul chegarasi

**Files:** repoda o'zgarmaydi, agar chegara bajarilsa. Bajarilmasa — Step 5 dagi tugmalar `D/dengiz-reja.ts`, `D/dengiz-reja.test.ts`, `D/dengiz-sahna.test.ts` ni o'zgartiradi (har tugma alohida commit). Skript repoga KIRMAYDI.

**Interfaces:**
- Consumes: Task 1–7 ning hammasi; `next start` dagi production build; nazoratchining mock API'si va o'quvchi sifatida kirgan Playwright `storageState` fayli; DOM belgilari `[data-yol-unit]` (yo'l), `[data-sahna="<tema>"]` (sahna); profil javobidagi `lernenTema`.
- Produces: o'lchov jadvali (har tema × rejim: p50, p95, fps, 33 ms dan uzun kadrlar, sahna elementlari) va PASS/FAIL qatorlari — PR tavsifiga va nazoratchiga.

Bu taskni **nazoratchi** bajaradi (mock API + `next start` uning muhitida). 3-bosqichdagi usulning o'zi: Chromium headless, CDP `Emulation.setCPUThrottlingRate = 4`, 4 soniyalik skroll tsikli, rAF kadr oraliqlari.

- [ ] **Step 1: Build and start the app (not in parallel with tests)**

Run: `cd client && npx next build`
Expected: muvaffaqiyatli. So'ng nazoratchi `next start` ni (odatda `http://localhost:3000`) va mock API'ni ishga tushiradi; mock A1 yo'lida kamida 6 unit bo'lsin (skroll uchun ≥ 600 px joy). O'quvchi sifatida kirgan holat `storageState` JSON fayliga saqlanadi (masalan, Playwright `context.storageState({ path })`).

- [ ] **Step 2: Write the measuring script (scratchpad, never committed)**

Bajaruvchining scratchpad papkasida `lernen-sahna-olchov.mjs`:

```js
// Scroll frame times of the Ta'lim path per look and mode (ADR-0133). Not in the repo.
// Run against `next start` + the mock API, signed in as a student:
//   CLIENT_DIR=<worktree>/client BASE_URL=http://localhost:3000 STORAGE_STATE=/abs/student-state.json node lernen-sahna-olchov.mjs
import { createRequire } from "node:module";
import path from "node:path";

const CLIENT_DIR = process.env.CLIENT_DIR;
if (!CLIENT_DIR) throw new Error("CLIENT_DIR is required: the worktree's client folder, whose Playwright is used");
const { chromium } = createRequire(path.join(CLIENT_DIR, "package.json"))("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STATE = process.env.STORAGE_STATE;
if (!STATE) throw new Error("STORAGE_STATE is required: a signed-in student's Playwright storage state");
const RUNS = Number(process.env.RUNS ?? 3);
const SECONDS = 4;
const LOOKS = ["toza", "ormon", "dengiz"];
const MODES = ["full", "light", "reduced"];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measureOnce(browser, look, mode) {
  const context = await browser.newContext({
    storageState: STATE,
    viewport: { width: 390, height: 844 },
    reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
  });
  // «light»: a 4-core device, which `useYengilRejim` reads as weak; the others a strong one.
  await context.addInitScript((cores) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => cores });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  }, mode === "light" ? 4 : 8);
  // The look comes from the account: only the profile answer's `lernenTema` is replaced.
  await context.route("**/student-portal/profile", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, lernenTema: look } });
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/portal/lernen`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-yol-unit]");
  if (look !== "toza") await page.waitForSelector(`[data-sahna="${look}"]`);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async (seconds) => {
    const room = document.documentElement.scrollHeight - innerHeight;
    if (room < 600) throw new Error(`the path is too short to scroll (${room} px): give the mock a longer path`);
    const deltas = [];
    let dir = 1;
    let last = performance.now();
    const end = last + seconds * 1000;
    await new Promise((done) => {
      const frame = (now) => {
        deltas.push(now - last);
        last = now;
        if (scrollY >= room - 12) dir = -1;
        else if (scrollY <= 12) dir = 1;
        scrollBy(0, dir * 12);
        if (now < end) requestAnimationFrame(frame);
        else done();
      };
      requestAnimationFrame(frame);
    });
    deltas.shift();
    const s = [...deltas].sort((a, b) => a - b);
    return {
      p50: s[Math.floor(s.length * 0.5)],
      p95: s[Math.floor(s.length * 0.95)],
      long: s.filter((d) => d > 33.4).length,
      elements: document.querySelectorAll("[data-sahna] *").length,
    };
  }, SECONDS);
  await context.close();
  return result;
}

const browser = await chromium.launch();
const rows = [];
for (const look of LOOKS) {
  for (const mode of MODES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(browser, look, mode));
    const p50 = median(runs.map((r) => r.p50));
    rows.push({
      look,
      mode,
      p50,
      p95: median(runs.map((r) => r.p95)),
      fps: 1000 / p50,
      long: median(runs.map((r) => r.long)),
      elements: runs[0].elements,
    });
  }
}
await browser.close();

console.log("| look | mode | p50 ms | p95 ms | fps (p50) | frames > 33 ms | scene elements |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.look} | ${r.mode} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.fps.toFixed(0)} | ${r.long} | ${r.elements} |`);
}

const row = (look, mode) => rows.find((r) => r.look === look && r.mode === mode);
const checks = [
  ["Dengiz full p50 <= 20 ms", row("dengiz", "full").p50 <= 20],
  ["Dengiz full p50 <= 0.7 x O'rmon full p50", row("dengiz", "full").p50 <= 0.7 * row("ormon", "full").p50],
  ["Dengiz full p95 < O'rmon full p95", row("dengiz", "full").p95 < row("ormon", "full").p95],
  ["Dengiz light p50 <= 1.1 x Toza light p50", row("dengiz", "light").p50 <= 1.1 * row("toza", "light").p50],
  ["Dengiz reduced p50 <= 1.1 x Toza reduced p50", row("dengiz", "reduced").p50 <= 1.1 * row("toza", "reduced").p50],
  ["Dengiz full scene elements <= 300", row("dengiz", "full").elements <= 300],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
```

- [ ] **Step 3: Run it**

Run: `CLIENT_DIR=/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/lernen-dizayn/client BASE_URL=http://localhost:3000 STORAGE_STATE=<o'quvchi holati fayli> node <scratchpad>/lernen-sahna-olchov.mjs`
Expected: 9 qatorli jadval va 6 ta `PASS`; chiqish kodi 0. Mo'ljal (3-bosqich raqamlariga ko'ra): Toza ~60 fps (p50 ~16.7 ms) hamma rejimda; O'rmon to'liq ~30 fps; Dengiz to'liq ≥ 50 fps; Dengiz yengil va kam harakat ≈ Toza; Dengiz to'liq sahna ~180 element.

- [ ] **Step 4: Report the numbers**

Jadvalni va `PASS`/`FAIL` qatorlarini nazoratchiga bering va PR tavsifiga «Unumdorlik (CPU 4×, 390×844, 4 s skroll, 3 o'lchov medianasi)» sarlavhasi bilan qo'ying (ADR-0133, 6-band). Hammasi `PASS` bo'lsa — bu task tugadi, commit yo'q.

- [ ] **Step 5: Only if a check fails — turn the knobs, one at a time, re-measuring after each**

Har tugmadan keyin: `cd client && npx vitest run src/components/student-portal/lernen/tema/dengiz`, `npx next build`, `next start` qayta, Step 3 qayta. Bitta tugma yetsa — keyingisiga o'tilmaydi. Har tugma o'z commit'i: `perf(lernen): <nima> — measured under CPU 4x` + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

**A — «light» yoki «reduced» qatori Toza darajasida emas.** «reduced» o'tmasa — tugma yo'q, to'xtang (kam harakatda parallaks va ambient allaqachon yo'q: sabab boshqa joyda, masalan `will-change` qaytmagani — `globals-css.test.ts` va brauzer tekshiruvi). «light» o'tmasa — zaif qurilmada qoyalar qotadi:

`D/dengiz-reja.ts` — Old:

```ts
    parallax: !reduced,
```

New:

```ts
    // Measured under CPU 4x (Task 8): a weak device keeps Toza's frame rate only with still walls.
    parallax: !reduced && !light,
```

`D/dengiz-reja.test.ts` — Old:

```ts
  it("draws about half on a weak device, and no fronds", () => {
    expect(dengizPlan({ reduced: false, light: true })).toEqual({ decor: 2, sways: 0, bubbles: 4, schools: 1, parallax: true });
  });
```

New:

```ts
  it("draws about half on a weak device, no fronds, and holds the walls still", () => {
    expect(dengizPlan({ reduced: false, light: true })).toEqual({ decor: 2, sways: 0, bubbles: 4, schools: 1, parallax: false });
  });
```

**B — «full» qatori chegaradan og'ir.** Tartib bilan, faqat kerakligicha:

B1 (pufakchalar 8 → 6). `D/dengiz-reja.ts` — Old: `    bubbles: reduced ? 0 : light ? 4 : 8,` → New: `    bubbles: reduced ? 0 : light ? 4 : 6,`. `D/dengiz-reja.test.ts` — Old:

```ts
  it("draws the full dive: four decorations a strip, two fronds, eight bubbles, two schools, the walls following the scroll", () => {
    expect(dengizPlan({ reduced: false, light: false })).toEqual({ decor: 4, sways: 2, bubbles: 8, schools: 2, parallax: true });
  });
```

New:

```ts
  it("draws the full dive: four decorations a strip, two fronds, six bubbles, two schools, the walls following the scroll", () => {
    expect(dengizPlan({ reduced: false, light: false })).toEqual({ decor: 4, sways: 2, bubbles: 6, schools: 2, parallax: true });
  });
```

`D/dengiz-sahna.test.ts` — Old:

```ts
  it("draws the water's life by the plan: eight bubbles and two schools, fewer on a weak device, none under «Kam harakat»", () => {
    expect(count(chiz({}), 'class="dengiz-bubble"')).toBe(8);
```

New:

```ts
  it("draws the water's life by the plan: six bubbles and two schools, fewer on a weak device, none under «Kam harakat»", () => {
    expect(count(chiz({}), 'class="dengiz-bubble"')).toBe(6);
```

B2 (to'dalar 2 → 1). `D/dengiz-reja.ts` — Old: `    schools: reduced ? 0 : light ? 1 : 2,` → New: `    schools: reduced ? 0 : 1,`. `D/dengiz-reja.test.ts` — to'liq reja kutilmasidagi `schools: 2` → `schools: 1` va sarlavhadagi «two schools» → «one school». `D/dengiz-sahna.test.ts` — Old: `    expect(count(chiz({}), 'class="dengiz-school"')).toBe(2);` → New: `    expect(count(chiz({}), 'class="dengiz-school"')).toBe(1);`; `D/dengiz-reja.test.ts` dagi `schoolSpecs(2)` testlari o'zgarmaydi (u funksiyaning o'zini tekshiradi).

B3 (tasmadagi bezak 4 → 3). `D/dengiz-reja.ts` — Old: `    decor: light ? 2 : 4,` → New: `    decor: light ? 2 : 3,`. `D/dengiz-reja.test.ts` — to'liq reja kutilmasidagi `decor: 4` → `decor: 3` va sarlavhadagi «four decorations» → «three decorations».

Hamma kerakli tugmadan keyin ham biror qator `FAIL` — «To'xtash shartlari»: to'xtang, jadvalni nazoratchiga bering.

---

### Task 9: Tekshiruv — to'liq darvozalar va brauzer ro'yxati

**Files:** o'zgarmaydi (faqat tekshiruv; topilgan xato tegishli taskning fayllarida tuzatiladi va alohida commit bo'ladi).

**Interfaces:**
- Consumes: Task 1–8 ning hammasi.
- Produces: yashil darvozalar va nazoratchi uchun brauzer ro'yxati natijasi.

- [ ] **Step 1: Full client test suite**

Run: `cd client && npx vitest run`
Expected: hammasi PASS (yangi: `sahna-umumiy`, `dengiz-reja`, `dengiz-sahna`, `dengiz-orinlar`, `dengiz-tema`, `dengiz-kontrast`, `globals-css` Dengiz bloklari, sahifalarning Dengiz bloklari; O'rmon va Toza testlari kutilmalari o'zgarmagan holda).

- [ ] **Step 2: i18n coverage**

Run: `cd client && npm run i18n:check`
Expected: PASS (`STRICT_FILES` da `sahna-qismlari.tsx` va `dengiz-unit-lavha.tsx`; yagona yangi kalit `"{n} m"`).

- [ ] **Step 3: Types**

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz.

- [ ] **Step 4: Lint**

Run: `cd client && npx eslint src`
Expected: `✖ N problems (0 errors, …)` — errors = 0, ogohlantirishlar soni `main` dagidan oshmagan. Prettier ISHLATILMAYDI.

- [ ] **Step 5: Production build (after the tests, not in parallel)**

Run: `cd client && npx next build`
Expected: muvaffaqiyatli; `/portal/lernen` va `/portal/lernen/units/[id]` xatosiz.

- [ ] **Step 6: Boundary checks**

Run: `git diff --stat origin/main -- server/`
Expected: bo'sh.

Run: `git diff --stat origin/main -- client/src/components/student-portal/lernen/yol client/src/components/student-portal/lernen/fortschritt.ts client/src/components/student-portal/lernen/seans-navbat.ts client/src/components/student-portal/lernen/lernen-levels-page.tsx client/src/components/student-portal/lernen/lernen-unit-page.tsx client/src/components/student-portal/lernen/harakat`
Expected: bo'sh (sahifalar, yo'l mantig'i va hook'lar tegilmagan).

Run: `grep -rln "gsap" client/src --include='*.ts' --include='*.tsx'`
Expected: faqat `client/src/components/student-portal/lernen/dafi/` ostidagi fayllar.

Run: `grep -rnE "filter=|filter:|filter\(|feGaussianBlur|feTurbulence|blend" client/src/components/student-portal/lernen/tema/dengiz --include='*.tsx'`
Expected: bo'sh (izohlardagi «no filter» so'zi bu naqshlarga tushmaydi; atribut, CSS qiymati yoki SVG filtri — tushadi).

Run: `wc -l client/src/components/student-portal/lernen/tema/dengiz/*.ts* client/src/components/student-portal/lernen/tema/sahna-umumiy.ts client/src/components/student-portal/lernen/tema/sahna-qismlari.tsx`
Expected: har yangi fayl ≤ 500 qator.

Run: `git status --short`
Expected: `ormon-oltin.tmp.test.ts`, `__snapshots__` va o'lchov skripti yo'q.

- [ ] **Step 7: Browser checklist (the controller: mock API + Playwright on `next start`, Chromium AND WebKit)**

Profil javobida `lernenTema: "dengiz"` (yoki Sozlamalarda tanlab). Har band uchun skrinshot (Chromium; 1, 2, 4, 7 — WebKit'da ham).

1. **Sozlamalar → «Ta'lim ko'rinishi»:** to'rt karta — «Toza» (rang nuqtasi), «O'rmon» (miniatyura), «Dengiz» (miniatyura, tanlanadi), «Nemis sayohati» (xira, «Tez orada», bosilmaydi). Dengiz tanlanganda ostida dengiz tugunlari (marvarid, oltin, xira tosh) va mukofot misoli (sayoz suv, qum, aylanuvchi nur); qayta yuklashda ham tanlangan.
2. **Yo'l, 3 skroll nuqtasi** (tepa; joriy unit; pastki unit): sahna butun ekranni to'ldiradi, oq bo'shliq yo'q; unitlar yopishqoq chiziqdan o'tganda zona marjon → kelp → chuqur bo'lib yumshoq almashadi (700 ms, 250 ms kutish bilan; sahifa ochilganda zonalar ketma-ket miltillamaydi); chetdagi qoyalar kontentdan sekinroq siljiydi; pufakchalar ko'tariladi, baliqlar suzib o'tadi, pastki burchakdagi o'simliklar tebranadi, nur sekin suzadi; sarlavha, daraja yorlig'i, bo'lim nomi va tugun nomlari oq parda ustida o'qiladi.
3. **Yuklanish va xato:** so'rov kechiktirilganda skelet ostida sahna turadi; so'rov yiqilganda «Ma'lumotni yuklab bo'lmadi» kartasi parda ustida.
4. **Unit sahifasi:** unit tartibi 1/2/3 → marjon/kelp/chuqur; lavha zona rangida, chuqurlik belgisi «5 m» / «25 m» / «70 m», Dafi salom beradi; darslar chig'anoq uyi / kema / g'or / xazina bo'lib chap-o'ng almashadi; qulflangan joy qorong'ulikda, bosilsa qisqa «tuk» va hech qayerga o'tmaydi; joriy joyda ko'k halqa, belgisi chayqaladi, «Boshlash»; tugagan joyda «Yana mashq qilish · N yangi so'z» amber; eski DiB uniti (bo'limsiz) ham chig'anoq uylari bilan chiziladi.
5. **Natija ekrani** (dars tugagach): sayoz suv va qum foni, bayramda sekin aylanuvchi nur; sarlavha va qator o'qiladi; konfeti, `mukofot` ovozi va Dafi sakrashi avvalgidek, Dafi quloqlari kesilmaydi; yakuniy sinovdan o'tilmaganda nur yo'q.
6. **Qorong'u rejim:** sahna ustida qorong'u parda; pardalar va joy kartalari to'q sirt; matn o'qiladi; mukofot foni chuqur dengiz.
7. **360 px telefon** (pastki navigatsiya sahna ustida, hech narsa kesilmaydi, gorizontal skroll yo'q) va **desktop rail bilan** (kengaytirilgan va yig'ilgan): sahna rail chetidan boshlanadi; qoyalar ikki chetda; o'rta qism suv, tizma, nur, pufakcha va baliq.
8. **Kam harakat** (avval qurilma kaliti, keyin tizim `prefers-reduced-motion`): skrollda qoyalar qimirlamaydi; pufakcha va baliq yo'q; nur va o'simliklar to'xtagan; zona darrov almashadi; joriy tugunning halqasi yo'q, lekin oltin rang va yulduz bilan ajralib turadi; joy belgisi qotgan; natijada nur aylanmaydi. Kalit o'chirilganda hammasi qaytadi.
9. **Zaif qurilma** (`addInitScript` bilan `navigator.hardwareConcurrency = 4`): DOMda `dengiz-sway` yo'q, `dengiz-bubble` 4 ta, `dengiz-school` 1 ta, har tasmada 2 bezak.
10. **Pauza:** tab yashirilib qaytarilganda sahna ildizida `data-tinch` paydo bo'ladi va yo'qoladi; animatsiyalar davom etadi.
11. **Element soni:** `document.querySelectorAll('[data-sahna="dengiz"] *').length` ≤ 300 (kutilgan ~180 to'liq rejimda).
12. **Sahna ustidagi varaq:** tugun bosilganda dars varag'i ochiladi; uning overlay'ida va pastki navigatsiya/radio panelida `getComputedStyle(el).backdropFilter === "none"` (Chromium va WebKit); maqsad kartasi dialogida ham.
13. **Bo'yash:** Chrome Performance + «Paint flashing» — skrollda qoya tasmalari va sahna qayta bo'yalmaydi (faqat Composite); Task 8 jadvali shu yerga ilova qilinadi.
14. **ru/de:** Sozlamalarda «Море» / «Meer» va «Подводный мир» / «Eine Unterwasserwelt»; lavhada «70 м» (ru), «70 m» (de); «Boshlash» va qulflangan joyning ekran o'quvchi nomi tarjima qilingan; ekranda inglizcha so'z yo'q.
15. **«O'rmon» va «Toza» o'zgarmagan:** O'rmonga qaytilganda o'rmon, tugun, joylar, lavha va mukofot 3-bosqich skrinshotlari bilan bir xil; «Toza»da sahna yo'q, parda yo'q, kartalar avvalgi ko'rinishda.

- [ ] **Step 8: Report**

Hech narsa commit qilinmaydi (bu task fayl o'zgartirmaydi). Nazoratchiga: 1–6-qadam natijalari (sonlar bilan), Task 8 jadvali, brauzer ro'yxatidagi har bandning holati va skrinshotlar.

---

## Spec qamrovi

| Spec / talab | Qayerda |
|---|---|
| §5 `Sahna` o'rni, qatlamlar `absolute`, faqat `transform`/`opacity`, bitta rAF, `visibilitychange` + `IntersectionObserver` | mavjud hook'lar + Task 3, 4 |
| §5 `palitraUnitga(unitIndeksi)` | Task 1 (`unitCycleIndex`), Task 2 (`zoneForUnit`) |
| §7 kartada miniatyura, faqat tayyor temalar tanlanadi | Task 6 (`DengizMiniatyura`), Task 7 (`tayyor: true`) |
| §8 Dengiz: skroll = chuqurlik, marjon → kelp → chuqur dengiz, pufakchalar, baliqlar; unit sahnasi chig'anoq uyi / kema / g'or / xazina; qulflilar qorong'ulikda; bo'shliq yo'q | Task 2–7; Qarorlar 1–3 |
| §9 kam harakat — parallaks va ambient o'chadi; yengil rejim — yarmi | Task 2 (`dengizPlan`), Task 4 (CSS), Task 8 |
| §10 `.lumio` tokenlari, rail'dan chiqish, yuklanayotganda ham fon, Prettier yo'q, o'zbekcha matn | Task 4, 6, 7 (sahifa testlari), Global Constraints |
| §11 sof funksiya va statik markup testlari, ≤ 1500 element (Dengiz ≤ 300), qo'lda tekshiruv | har task, Task 3, Task 9 |
| §12 4-bosqich alohida PR, ADR | Task 7 (ADR-0133) |
| §14 zaif telefon, emoji o'rniga SVG/phosphor | Task 3, 5, 8 |
| 3-bosqich ko'rigi: noma'lum dars turi, bitta sahna/id'lar, CSS qamrovi va izohlar, `will-change`, kontrast, chok, byudjet | Task 1 (`joyTanla`), 2 (chok), 3 (id, byudjet), 4 (skaner), 6 (kontrast, miniatyura) |
| O'rmon va Toza o'zgarmasligi | Task 1 (oltin-nusxa testi), Task 9 Step 1 va brauzer 15-band |

