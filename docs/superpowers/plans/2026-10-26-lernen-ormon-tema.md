# Ta'lim dizayni — 3-bosqich («O'rmon» temasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «O'rmon» temasini qurish va Sozlamalarda tanlashga ochish: yo'l va unit sahifasi orqasida uch biomli (tong, ko'l, kuz) parallaks sahna (uchqunlar, nur dastasi, tuman, yumshoq daraxtlar), o'rmon tuguni, unit sahifasida darslar sahnadagi «joy» (kulba, ko'prik, g'or, qal'a; qulflilari tumanda), o'rmon lavhasi va mukofot foni, kartadagi miniatyura.

**Architecture:** Tema shartnomasi (`LernenTema`) uchta o'rin oladi: `UnitJoyi` (majburiy; «Toza»niki — unit sahifasidagi mavjud karta, so'zma-so'z ko'chiriladi), ixtiyoriy `Sahna` va ixtiyoriy `Miniatyura`. Sahnani SAHIFA chizadi — temaga bog'liq bo'lmagan `SahnaRamka` ichida (`fixed`, kontent orqasida, rail'dan chiqib, yuklanayotganda ham). Hamma qaror sof, testlangan funksiyalarda (`biomeForUnit`, `scenePlan`, `layerOffset`, `scenePaused`, `layerShapes`, `placeForKind`, `joriyUnitTartibi`); komponentlar faqat chizadi. Yo'l mantig'i (`yol-tuzilishi.ts`, `fortschritt.ts`, `seans-navbat.ts`) tegilmaydi; `LernenYol` faqat ixtiyoriy `onUnitKorindi` prop'i va sahna ustidagi «parda» sinflarini oladi.

**Tech Stack:** Next.js 16 + React 19 + Tailwind 4 (client), inline SVG (seed'li tasodif — server va brauzer bir xil o'rmon chizadi), CSS `@keyframes` (faqat `transform`/`opacity`), bitta `requestAnimationFrame` (parallaks), `IntersectionObserver` + `visibilitychange` (pauza), Vitest node-muhiti (DOM yo'q, `renderToStaticMarkup` mumkin).

**Spec:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§3, §5, §8, §9, §10, §11, §12 bosqich 3, §14) · **ADR:** `docs/adr/0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md`, `docs/adr/0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md` · **Mockup (CEO tasdiqlagan):** `docs/superpowers/mockups/2026-10-24-lernen-dizayn/ormon2.html` (`PAL`, `soft`, `farLayer`/`midLayer`/`nearLayer`, `.ff`, `.rays`, `.mist`, `.node`, `.pl`, `.rew`) · **2-bosqich rejasi (format namunasi):** `docs/superpowers/plans/2026-10-25-lernen-dizayn-mashq-natija.md`.

> **Qamrov:** spec §12 ning faqat **3-bosqichi**. Dengiz va Nemis sayohati (4–5-bosqich), yo'ldagi unit qatori va daraja yorlig'ining tema ko'rinishi, tugunlarni bog'lovchi yo'l lentasi KIRMAYDI. Server o'zgarishi va migratsiya YO'Q (`ormon` id'si server ro'yxatida allaqachon bor).

## Global Constraints

Spec, 1–2-bosqich qoidalari va CEO qarorlaridan; har task uchun majburiy:

- **Ish joyi:** worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/lernen-dizayn`, shox `feat/lernen-ormon-tema` (origin/main'dan). Bash buyruqlari shu papkadan (`cd client && …` shu papkaga nisbatan); worktree'dan tashqariga `cd` QILINMAYDI. `client/node_modules` yo'q bo'lsa — `cd client && npm install` (bir marta).
- **Server o'zgarmaydi:** `server/` ga va Prisma sxemasiga tegilmaydi. Biror task server o'zgarishini talab qilsa — to'xtab, nazoratchiga aytiladi (jimgina qo'shilmaydi; pastdagi «To'xtash shartlari»).
- **Mantiq tegilmaydi:** `lernen/seans-navbat.ts`, `lernen/fortschritt.ts`, `lernen/yol/yol-tuzilishi.ts` o'zgarmaydi. `yol/lernen-yol.tsx` da faqat: ixtiyoriy `onUnitKorindi` prop'i va uning effekti, `sahnali` bayrog'i va ikki matnning «parda» sinfi (Task 9). `yol/yopishqoq-unit-lavha.tsx` `tema/` dan HECH QACHON import qilmaydi (`DARAJA_FONI` qiymat tsikli, ADR-0128).
- **«Toza» o'zgarmaydi:** «Toza»da `Sahna` yo'q; uning chizgan markup'i bir xil qoladi (unit sahifasidagi `SeansJoyi` `tema/toza/toza-unit-joyi.tsx` ga SO'ZMA-SO'Z ko'chadi). Mavjud testlar (`lernen-unit-page.test.ts`, `toza-*.test.ts`, `yopishqoq-unit-lavha.test.ts`, `student-portal-load-states.test.ts`) o'zgartirilmasdan yashil qoladi; faqat yangi `describe`/`it` qo'shiladi.
- **Tema faqat chizadi (ADR-0125, ADR-0128):** xato javob yumshoq (amber), ovozlar (`bos`, `qulf`, `togri`, `xato`, `mukofot`, `unitOchildi`), konfeti va Dafi qarorlari temaga bog'liq emas; O'rmon ularga tegmaydi. Tugun/joy bosilganda ovozni chaqiruvchi (sahifa) chaladi, tema emas.
- **Sahna qoidalari (spec §5, §9, §11):**
  - Sahnani sahifa `SahnaRamka` ichida chizadi: `fixed inset-0 -z-10`, sahifa ildizi `isolate`, `CONTENT_INSET[sidebarMode]` (rail ostiga kirmaydi), `aria-hidden`, `pointer-events-none`. Sahna yuklash holatidan OLDIN chiziladi — ma'lumot yo'q/yiqilgan bo'lsa ham fon turadi (bo'shliq yo'q).
  - Qatlamlar `position:absolute`; animatsiya faqat `transform` va `opacity` (`globals.css` dagi `@keyframes ormon-*` testi). Rang/`fill`/`filter`/`box-shadow` animatsiya qilinmaydi.
  - Skroll parallaksi sahna boshiga BITTA `requestAnimationFrame` (`harakat/use-sahna.ts` `useParallaks`); `visibilitychange` (yashirin tab) va `IntersectionObserver` (ekrandan tashqari) da to'xtaydi (`scenePaused`, `data-tinch`).
  - Qatlamlar 640 px li SVG plitkalar (`TILE`), `<use>` bilan uch marta takrorlanadi va siljish plitka bo'yicha aylanadi (`layerOffset`) — DOM yo'l uzunligiga bog'liq emas.
  - Xiralik (blur) SVG ichida (`feGaussianBlur`, bir marta rasterlanadi); harakatlanuvchi qatlamda CSS `filter` yo'q. Sahna ustidagi hech narsada `backdrop-filter` yo'q (har skroll kadrida qayta xiralanardi).
  - **Yengil rejim** (`yengilRejimmi`: `hardwareConcurrency <= 4` yoki `deviceMemory <= 2`): uzoq qatlam yo'q, daraxt/uchqun/barg/tuman/nur sharlari yarmi. Brauzer javob bermaguncha (server va birinchi chizish) yengil deb olinadi.
  - **Kam harakat** (tizim YOKI qurilma: `useKamHarakat()` renderda): sahna — qotgan rasm: parallaks yo'q, uchqun va tushayotgan barg chizilmaydi, nur va tuman qimirlamaydi, biom almashinuvi darrov (`data-kam-harakat` + `@media (prefers-reduced-motion)`).
  - Bitta sahnada ≤ 1500 DOM/SVG element (`ELEMENT_BUDGET`, statik markup testi; amalda ~400).
  - Qorong'u rejim: sahna ustida bitta statik qorong'u parda (`DARK_VEIL`, `hidden dark:block`), ikkinchi geometriya yo'q.
- **Kontrast ≥ 4.5:1:** sahifa sahnaga to'g'ridan-to'g'ri chizadigan umumiy matn (sarlavha, daraja yorlig'i, bo'lim sarlavhasi, bo'sh/xato holat) faqat tema sahnali bo'lganda shaffof bo'lmagan `bg-surface` parda ustida (`SAHNA_PARDASI`, `SAHNA_PARDASI_KICHIK`) — «Toza»dagi karta bilan bir xil fon. O'rmonning o'z matni (tugun yorlig'i, joy kartasi, lavha, «Boshlash», mukofot foni) uchun kontrast `ormon-kontrast.test.ts` da `globals.css` dagi haqiqiy tokenlar va `BIOMES` ranglaridan hisoblanadi (yorug' va qorong'u).
- **`gsap`:** faqat `dafi/dafi.tsx` ichidagi `import("gsap")`; O'rmon fayllarida `gsap` yo'q.
- **`.lumio` tokenlari:** yangi o'zgaruvchilar (`--ormon-*`) faqat `.lumio` va `.dark .lumio` bloklari ichida; global `@theme` ga yangi nom qo'shilmaydi (`globals-css.test.ts`). `globals.css` da CSS izohi deklaratsiya qiymati ichiga yozilmaydi (Lightning CSS butun blokni tashlab yuboradi) — izoh deklaratsiyadan yuqorida.
- **i18n:** ekrandagi hamma yangi matn o'zbek (lotin), inglizcha so'z yo'q. `t("…")` bor har yangi fayl `client/src/i18n/i18n-coverage.test.ts` dagi `STRICT_FILES` ga qo'shiladi; yangi matn bo'lsa `ru`/`de`/`en` lug'atlariga `};\n\nexport default xx;` dan OLDIN yoziladi (avval `grep` — mavjud kalit takrorlanmaydi). Bu rejadagi O'rmon fayllari faqat mavjud kalitlarni ishlatadi (`"{label} — hali ochilmagan"`, `"Boshlash"`, `"O'rmon"`, `"Yumshoq qatlamli o'rmon"`). Ma'lumot (`t()` ga hech qachon): `label`, `matn`, `titleDe`, `titleUz`.
- **Nomlash:** tema shartnomasi o'rinlari va tema komponentlari mavjud o'zbekcha nomlash bo'yicha (`Sahna`, `UnitJoyi`, `Miniatyura`, `OrmonTugun`, `SahnaRamka`); yangi sof yordamchilar, ma'lumot va CSS sinflari inglizcha (`biomeForUnit`, `scenePlan`, `layerOffset`, `.ormon-spark`). Kod izohlari va commit xabarlari INGLIZCHA.
- **Tahrir usuli:** mavjud fayllarda faqat rejadagi aniq old→new Edit'lar; «butun fayl (Write)» deyilgan joyda avval faylni Read qiling (tool shuni talab qiladi), keyin rejadagi matnni to'liq yozing.
- **Format:** `client/` da Prettier ISHLATILMAYDI. Yangi fayl 500 qatordan oshmaydi. Har commit oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Testlar:** `cd client && npx vitest run <yo'l>` (agar `configLoader` xatosi chiqsa: `npx vitest --config vitest.config.mts run <yo'l>`). Vitest DOM'siz: hook/effekt testlanmaydi — sof funksiya va statik markup testlanadi; zustand holatini statik renderdan oldin o'rnatib bo'lmaydi (qiymat prop bilan beriladi); brauzerdagina ko'rinadigan narsa Task 11 ro'yxatida. Bir xil buyruqni kod o'zgarmasdan qayta yugurtirmang. `npx next build` testlar bilan PARALLEL ishlatilmaydi.

## Qarorlar

1. **Shartnoma kengaytmasi:** `LernenTema` ga `UnitJoyi` (majburiy), `Sahna?` va `Miniatyura?` (ixtiyoriy), `UnitLavhaProps` ga `unitTartibi?`. Sabab: ADR-0128 «o'z unit sahnasi bo'lgan tema kelganda joy kartalari yangi o'ringa ko'chadi» degan; ixtiyoriy sahna «Toza»ni bir harf ham o'zgartirmaydi, majburiy `UnitJoyi` esa sahifada «qaysi tema?» shartini yo'qotadi.
2. **Sahnani sahifa `SahnaRamka` ichida chizadi, tema emas:** `fixed`, `-z-10` (ildiz `isolate`), `CONTENT_INSET`, `aria-hidden`. Sabab: rail, qatlam tartibi va «yuklanayotganda ham fon» qoidalari hamma tema uchun bir xil — bir joyda bir marta testlanadi; Dengiz/Nemis faqat ichini chizadi.
3. **Biom unitning darajadagi tartibidan:** `biomeForUnit(order)` = tong, ko'l, kuz, tong… (`(order − 1) mod 3`). Sabab: yo'l (`LernenLevelUnit.order`) ham, unit sahifasi (`LernenUnit.order`) ham `order` ni biladi — qo'shimcha so'rovsiz ikkala ekran bir biomni ko'rsatadi; spec §5 dagi `palitraUnitga` shu.
4. **Yo'lda biom ko'rinib turgan unitga ergashadi:** `LernenYol` mavjud `useJoriyUnit` natijasini `onUnitKorindi(unitId)` bilan sahifaga beradi; sahifa `joriyUnitTartibi(levels, unitId)` bilan tartibni topadi (ma'lumot yo'q — 1). Sabab: ikkinchi skroll tinglovchisi va DOM o'lchovi kerak emas; tema yo'l tuzilishini bilmaydi.
5. **Biom almashinuvi — `opacity` almashuvi:** uch biom to'plami (osmon, nur sharlari, qatlamlar) DOMda turadi, faqat joriysi ko'rinadi; boshqalari `visibility:hidden` (rasterlanmaydi). Sabab: rang/`fill` o'tishi har kadrda qayta chizadi (qoida faqat `transform`/`opacity`); 3 to'plam ham ~400 elementdan oshmaydi.
6. **Cheksiz qatlam — 640 px plitka + `<use>` nusxalari + aylanuvchi siljish:** sahna `fixed`, qatlam balandligi `calc(100% + 640px)`. Sabab: DOM va GPU qatlami yo'l uzunligidan mustaqil (yo'l 12 unit yoki 60 unit — bir xil), «bo'shliq yo'q» qoidasi ma'lumotsiz bajariladi.
7. **Xiralik SVG ichida, `backdrop-filter` yo'q:** mockupdagi `filter: blur()` qatlamlarda va «shisha» kartalar o'rniga `feGaussianBlur` (bir marta) va `bg-surface/90` kartalar. Sabab: harakatlanuvchi qatlamdagi CSS filtr va sahna ustidagi `backdrop-filter` zaif telefonda har skroll kadrida qayta hisoblanadi.
8. **Yengil rejim sukut bo'yicha, kam harakat — qotgan rasm:** `useYengilRejim` = `useSyncExternalStore` (server/birinchi chizish — `true`, keyin qurilma javobi); «Kam harakat»da parallaks yo'q, uchqun/barg chizilmaydi, nur/tuman/halqa/sakrash to'xtaydi, biom darrov almashadi. Sabab: zaif telefon hech qachon to'liq sahnani to'lamaydi va effekt ichida `setState` yo'q; spec §9 («parallaks va ambient o'chadi»), tizim sozlamasi hech qachon bekor qilinmaydi (ADR-0125).
9. **Umumiy matn sahnada — shaffof bo'lmagan `bg-surface` parda, faqat sahnali temada:** `SAHNA_PARDASI` (sarlavha bloki), `SAHNA_PARDASI_KICHIK` (bir qatorli yorliq), `SAHNA_KARTASI` (o'z paddingi bor bo'sh/xato holat). Sabab: sahna ostidagi rang har piksel boshqa — kafolatli 4.5:1 uchun matn «Toza» kartasidagi fonda turadi; «Toza»da shart `false`, markup o'zgarmaydi.
10. **O'rmon ko'rinishi mockupdan, daraja rangisiz:** tugun — oltin/yalpiz/xira tosh shar; joy — kulba (Tanishuv), ko'prik (Ishlatish), g'or (O'tish sinovi), qal'a (Yakuniy sinov), eski DiB darsi — kulba (`placeForKind`); emoji o'rniga kichik SVG, holat ikonalari `@phosphor-icons/react`; mukofot foni `--ormon-*` tokenlarida (yorug' — och yalpiz, qorong'u — chuqur yashil). Sabab: CEO tasdiqlagan ormon2.html, spec §14; natija matni `ink-900`/`ink-600` — mockupdagi to'q fon yorug' rejimda 4.5:1 ni buzardi.
11. **Tanlash:** `lib/lernen-temalar.ts` da `ormon` `tayyor: true`; karta `LernenTema.Miniatyura` ni (statik SVG) chizadi, miniatyurasiz tema — mavjud rang nuqtasi. Server ro'yxati (`server/src/common/lernen-temalar.ts`) allaqachon `ormon` ni o'z ichiga oladi — o'zgarmaydi, nusxa testi yashil.
12. **Nomlash:** shartnoma o'rinlari va tema komponentlari mavjud o'zbekcha nomlashda (`Sahna`, `UnitJoyi`, `OrmonTugun`), yangi sof yordamchilar va CSS sinflari inglizcha (`biomeForUnit`, `scenePlan`, `.ormon-spark`). Sabab: spec `Sahna` nomini bergan va shartnomaning qolgan o'rinlari o'zbekcha — aralash nom bitta interfeys ichida chalkashtirardi.
13. **Ataylab qilinmaydi (YAGNI):** tugunlarni bog'lovchi yorug' lenta (tugun koordinatalari DOM o'lchovini talab qiladi), daraxtlarning tebranishi (SVG ichidagi `transform` qayta chizadi), yo'ldagi unit qatori va daraja yorlig'ining O'rmon ko'rinishi (shartnomada o'rni yo'q — kerak bo'lsa 4–5-bosqich), O'rmon kodini alohida chunk'ka bo'lish (kichik; reyestr allaqachon «Toza»ni yuklaydi).

## To'xtash shartlari

- Biror qadam server, Prisma yoki `yol-tuzilishi.ts`/`fortschritt.ts`/`seans-navbat.ts` o'zgarishini talab qilsa — to'xtang va nazoratchiga yozing.
- Mavjud «Toza» testi (yuqorida sanalgan) o'zgartirilmasdan yashil bo'lmasa — testni moslashtirmang, to'xtang: bu «Toza» buzilgani.
- `isolate` sahifa ildizida biror qatlamni (pastki varaq, yopishqoq lavha, Dafi, radio) yopib qo'ysa (Task 11 brauzer tekshiruvi) — to'xtang, sahna qatlam tartibini nazoratchi bilan qayta hal qiling.

## File Structure

**Yangi** (`client/src/components/student-portal/lernen/…`):
- `tema/toza/toza-unit-joyi.tsx` — «Toza» joy kartasi (unit sahifasidan so'zma-so'z ko'chadi).
- `tema/sahna-ramka.tsx` (+`sahna-ramka.test.ts`) — `SahnaRamka`, `SAHNA_PARDASI`, `SAHNA_PARDASI_KICHIK`, `SAHNA_KARTASI` (temaga bog'liq emas).
- `harakat/parallaks.ts` (+test) — `layerOffset`, `scenePaused` (sof).
- `harakat/use-sahna.ts` — `useYengilRejim`, `useSahnaPauza`, `useParallaks` (hook'lar).
- `tema/ormon/ormon-biom.ts` (+test) — `BIOMES`, `biomeForUnit`, `DARK_VEIL`, `CARD_SURFACE_ALPHA`, `ACCENT`.
- `tema/ormon/ormon-sahna-rejasi.ts` (+test) — `TILE`, `LAYER_FACTOR`, `LAYER_BLUR`, `scenePlan`, `ELEMENT_BUDGET`.
- `tema/ormon/ormon-shakllar.ts` (+test) — seed'li tasodif, qatlam shakllari, uchqun/barg/tuman/nur sharlari spetsifikatsiyasi.
- `tema/ormon/ormon-qatlam.tsx` (+test) — bitta biomning bitta chuqurlik qatlami (SVG plitka).
- `tema/ormon/ormon-ambient.tsx` (+test) — nur, tuman, uchqunlar, barglar.
- `tema/ormon/ormon-sahna.tsx` (+test) — `OrmonSahnaChizma` (hook'siz) va `OrmonSahna` (`Sahna` o'rni).
- `tema/ormon/ormon-tugun.tsx` (+test) — `TugunBelgisi`.
- `tema/ormon/ormon-joy-belgilari.tsx` — kulba/ko'prik/g'or/qal'a SVG belgilari va `placeForKind`.
- `tema/ormon/ormon-joy.tsx` (+`ormon-joy.test.ts`) — `UnitJoyi`.
- `tema/ormon/ormon-unit-lavha.tsx` — `UnitLavha`.
- `tema/ormon/ormon-mukofot-foni.tsx` — `MukofotFoni`.
- `tema/ormon/ormon-miniatyura.tsx` — `Miniatyura`.
- `tema/ormon/ormon-tema.ts` (+`ormon-tema.test.ts`) — temaning yig'masi; `ormon-mukofot-foni.tsx` ham shu testda.
- `tema/ormon/ormon-kontrast.test.ts` — O'rmon matnlarining kontrasti.
- `lernen-levels-page.test.ts` — yo'l sahifasining sahna simlari.
- `client/src/test-support/hex-contrast.ts` — hex kontrast yordamchisi (faqat testlar).

**O'zgaradi:**
- `tema/tema-turlari.ts`, `tema/toza/toza-tema.ts`, `tema/toza/toza-orinlar.test.ts`, `tema/tema-reyestri.ts` (+test).
- `lernen-unit-page.tsx` (+`lernen-unit-page.test.ts`), `lernen-levels-page.tsx`, `yol/lernen-yol.tsx`, `yol/joriy-unit.ts` (+test).
- `client/src/components/student-portal/lernen-korinish-tanlash.tsx` (+test), `client/src/lib/lernen-temalar.ts` (+test).
- `client/src/app/globals.css` (+`globals-css.test.ts`), `client/src/i18n/i18n-coverage.test.ts`.

**Hujjatlar:** `docs/adr/0131-lernen-ormon-tema-sahna-va-joy-orinlari.md`, `docs/adr/README.md`, `client/CLAUDE.md`.

Yo'l qisqartmasi: quyida `L/` = `client/src/components/student-portal/lernen/`, `O/` = `L/tema/ormon/`.

---

### Task 1: Client — shartnoma kengayadi, «Toza» joy kartasi `UnitJoyi` o'rniga ko'chadi

**Files:**
- Modify (butun fayl, Write): `L/tema/tema-turlari.ts`
- Create: `L/tema/toza/toza-unit-joyi.tsx`
- Modify: `L/tema/toza/toza-tema.ts`
- Modify (butun fayl, Write): `L/lernen-unit-page.tsx`
- Test: `L/tema/toza/toza-orinlar.test.ts` (qo'shiladi), `L/tema/tema-reyestri.test.ts` (o'zgaradi), `L/lernen-unit-page.test.ts` (o'zgarmaydi — yashil qolishi shart)
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`)

**Interfaces:**
- Consumes: `tugunRangi(holat: TugunHolat, tone: TugunTone): { yuz: string; lab: string }`, `belgiTuri(holat): "tekshirildi" | "yulduz" | "qulf"`, `DARAJA_TONI` (`L/tema/toza/toza-tugun-model.ts`); `seansHolatlari` (`L/fortschritt.ts`); `type DafLessonKind = "SECTION_A" | "SECTION_B" | "BRIDGE" | "UNIT_TEST"` (`L/types.ts`).
- Produces (keyingi tasklar shularga tayanadi):
  - `interface UnitJoyiProps { label: string; kind: DafLessonKind | null; holat: TugunHolat; tone: TugunTone; izoh: string | null; tartib: number; onClick: () => void; onBosilmagan: () => void }`
  - `interface SahnaProps { unitTartibi: number }`
  - `UnitLavhaProps` ga `unitTartibi?: number`
  - `LernenTema` ga `UnitJoyi: React.ComponentType<UnitJoyiProps>`, `Sahna?: React.ComponentType<SahnaProps>`, `Miniatyura?: React.ComponentType`
  - `TozaUnitJoyi(props: UnitJoyiProps)` (`L/tema/toza/toza-unit-joyi.tsx`)
  - Unit sahifasi joylarni faqat `tema.UnitJoyi` orqali chizadi va `tema.UnitLavha` ga `unitTartibi={data.order}` beradi.

- [ ] **Step 1: Check the branch**

Run: `git branch --show-current`
Expected: `feat/lernen-ormon-tema`.

- [ ] **Step 2: Write the failing tests**

`L/tema/toza/toza-orinlar.test.ts` — importlarga qo'shing va fayl OXIRIGA `describe` qo'shing.

Import qatori (mavjud `import { TozaUnitLavha } from "./toza-unit-lavha";` dan keyin):

```ts
import { TozaUnitJoyi } from "./toza-unit-joyi";
```

Fayl oxiriga:

```ts
describe("<TozaUnitJoyi />", () => {
  const joy = (over: Partial<Parameters<typeof TozaUnitJoyi>[0]>) =>
    renderToStaticMarkup(
      createElement(TozaUnitJoyi, {
        label: "Tanishuv",
        kind: "SECTION_A",
        holat: "active",
        tone: "coral",
        izoh: null,
        tartib: 0,
        onClick: () => {},
        onBosilmagan: () => {},
        ...over,
      }),
    );

  it("is the path's node card: «Boshlash» on the darker lip of the level colour, only on the current place", () => {
    expect(joy({})).toMatch(/text-white[^>]*style="background:color-mix\(in srgb, var\(--coral-500\) 72%, black\)">Boshlash</);
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("a locked place stays pressable but tells screen readers it is closed", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it("writes the words-left caption in the amber ink", () => {
    expect(joy({ holat: "done", izoh: "Yana mashq qilish · 14 yangi so'z" })).toMatch(
      /text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/,
    );
  });
});
```

`L/tema/tema-reyestri.test.ts` — ikkita `it` ni almashtiring.

Old:

```ts
  it("every finished theme draws the result background and the unit header (ADR-0128)", () => {
    for (const tema of Object.values(TEMALAR)) {
      expect(tema?.MukofotFoni, `${tema?.id}: MukofotFoni`).toBeTruthy();
      expect(tema?.UnitLavha, `${tema?.id}: UnitLavha`).toBeTruthy();
    }
  });
```

New:

```ts
  it("every finished theme draws the result background, the unit header and the lesson places (ADR-0128, ADR-0131)", () => {
    for (const tema of Object.values(TEMALAR)) {
      expect(tema?.MukofotFoni, `${tema?.id}: MukofotFoni`).toBeTruthy();
      expect(tema?.UnitLavha, `${tema?.id}: UnitLavha`).toBeTruthy();
      expect(tema?.UnitJoyi, `${tema?.id}: UnitJoyi`).toBeTruthy();
    }
  });
```

Old:

```ts
      expect(tema.UnitLavha, `${id}: UnitLavha`).toBeTruthy();
    }
    expect(temaTop("alp").id).toBe("toza");
```

New:

```ts
      expect(tema.UnitLavha, `${id}: UnitLavha`).toBeTruthy();
      expect(tema.UnitJoyi, `${id}: UnitJoyi`).toBeTruthy();
    }
    expect(temaTop("alp").id).toBe("toza");
  });

  it("«Toza» draws no scene: the plain app background stays", () => {
    expect(temaTop("toza").Sahna).toBeUndefined();
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema`
Expected: FAIL — `./toza-unit-joyi` moduli topilmadi; reyestr testida `toza: UnitJoyi` — `expected undefined to be truthy`.

- [ ] **Step 4: Extend the contract**

`L/tema/tema-turlari.ts` — avval Read, keyin butun faylni yozing:

```ts
import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { DafLessonKind, DafLevel } from "../types";

export const TUGUN_TONLARI = ["coral", "amber", "teal", "sky", "grape"] as const;
export type TugunTone = (typeof TUGUN_TONLARI)[number];
export type TugunHolat = "done" | "active" | "locked";

export interface TugunBelgisiProps {
  /** The section's own name; also the accessible name. */
  label: string;
  holat: TugunHolat;
  tone: TugunTone;
  /** Open the lesson sheet (not given for a node that cannot be opened). */
  onClick?: () => void;
  /** The student pressed a locked node: the caller plays the "locked" sound. */
  onBosilmagan?: () => void;
}

export interface MukofotFoniProps {
  /**
   * The result is a celebration (a lesson or a review done, a final test
   * passed); a theme may draw its own reward scene for it. The sound, the
   * confetti and Dafi are not the theme's.
   */
  bayram: boolean;
  children: React.ReactNode;
}

export interface UnitLavhaProps {
  daraja: DafLevel;
  /** «A1 · Essen und Trinken»: data, drawn as it comes. */
  matn: string;
  /** The unit's order in its level (1-based): a theme with a scene tints its header by it (ADR-0131). */
  unitTartibi?: number;
}

/**
 * One lesson of the unit page drawn as a «place» (spec §8, ADR-0131). The page
 * has already decided everything — the name, the lock state, the words-left
 * caption; the theme only draws it.
 */
export interface UnitJoyiProps {
  /** The lesson's name in the path's words («Tanishuv»); also the accessible name. */
  label: string;
  /** The lesson's step in the unit (`null`: an old DiB lesson); a scene picks its place by it. */
  kind: DafLessonKind | null;
  holat: TugunHolat;
  tone: TugunTone;
  /** «Yana mashq qilish · N yangi so'z» under a finished section lesson, else `null`. */
  izoh: string | null;
  /** The place's position on the page (0-based): a scene may alternate sides by it. */
  tartib: number;
  onClick: () => void;
  /** A locked place was pressed: the caller plays the "locked" sound. */
  onBosilmagan: () => void;
}

/** The background a theme draws behind the path and the unit page (spec §5, ADR-0131). */
export interface SahnaProps {
  /** The order (1-based, within its level) of the unit the student is looking at; 1 while it is unknown. */
  unitTartibi: number;
}

/**
 * What a theme supplies to Ta'lim (ADR-0125, ADR-0128, ADR-0131). A theme only
 * DRAWS: the path, locks, points, the exercise screen, the confetti and the
 * sound/Dafi decisions are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
  /** The result screen's background around Dafi, the heading and the cards. */
  MukofotFoni: React.ComponentType<MukofotFoniProps>;
  /** The unit page's header. */
  UnitLavha: React.ComponentType<UnitLavhaProps>;
  /** A lesson of the unit page. */
  UnitJoyi: React.ComponentType<UnitJoyiProps>;
  /**
   * The scene behind the path and the unit page. The page draws it inside
   * `SahnaRamka` (fixed, behind the content, clear of the rail), also while
   * its data loads. Absent: the plain app background («Toza»).
   */
  Sahna?: React.ComponentType<SahnaProps>;
  /** The still picture on the theme's card in Settings; absent: the swatch dot. */
  Miniatyura?: React.ComponentType;
}
```

- [ ] **Step 5: Move the «Toza» place card**

`L/tema/toza/toza-unit-joyi.tsx` (markup unit sahifasidagi `SeansJoyi` bilan bir xil — faqat nom `label`, izoh tayyor keladi):

```tsx
"use client";

import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { UnitJoyiProps } from "../tema-turlari";
import { belgiTuri, tugunRangi } from "./toza-tugun-model";

/**
 * «Toza»: one lesson as a place of the unit (spec §8) — the path's own node
 * badge (check, star, lock), the name, and «Boshlash» on the current one. A
 * locked place stays a button — it answers with the short "locked" sound —
 * but tells screen readers it is closed, as the path node does.
 */
export function TozaUnitJoyi({ label, holat, tone, izoh, onClick, onBosilmagan }: UnitJoyiProps) {
  const t = useT();
  const qulf = holat === "locked";
  const joriy = holat === "active";
  const { yuz, lab } = tugunRangi(holat, tone);
  const belgi = belgiTuri(holat);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;
  return (
    <button
      type="button"
      onClick={qulf ? onBosilmagan : onClick}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label }) : undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card border-2 border-b-[5px] border-line bg-surface px-4 py-3 text-left transition-transform",
        qulf ? "cursor-default" : "active:translate-y-[3px] hover:-translate-y-0.5",
      )}
      style={joriy ? { borderColor: yuz } : undefined}
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full"
        style={{
          background: yuz,
          color: qulf ? "var(--ink-400)" : "#fff",
          boxShadow: `0 4px 0 ${lab}`,
        }}
      >
        <Icon size={22} weight="fill" />
      </span>
      <span className="min-w-0 flex-1">
        {/* Text on white: ink-600 (6.58:1) for a closed lesson — a pale ink-400 (2.52:1) is unreadable, the lock badge already says "closed". */}
        <span
          className={cn(
            "block truncate font-semibold",
            qulf ? "text-ink-600" : "text-ink-900",
          )}
        >
          {label}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">
            {izoh}
          </span>
        ) : null}
      </span>
      {joriy ? (
        // White text needs 4.5:1: the level colour itself is 2.48-4.23:1, its darker lip 4.56-7.10:1.
        <span
          className="shrink-0 rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
          style={{ background: lab }}
        >
          {t("Boshlash")}
        </span>
      ) : null}
    </button>
  );
}
```

`L/tema/toza/toza-tema.ts` — Old:

```ts
import { TozaUnitLavha } from "./toza-unit-lavha";

export const tozaTema: LernenTema = {
  id: "toza",
  TugunBelgisi: TozaTugun,
  MukofotFoni: TozaMukofotFoni,
  UnitLavha: TozaUnitLavha,
};
```

New:

```ts
import { TozaUnitJoyi } from "./toza-unit-joyi";
import { TozaUnitLavha } from "./toza-unit-lavha";

export const tozaTema: LernenTema = {
  id: "toza",
  TugunBelgisi: TozaTugun,
  MukofotFoni: TozaMukofotFoni,
  UnitLavha: TozaUnitLavha,
  UnitJoyi: TozaUnitJoyi,
};
```

- [ ] **Step 6: The unit page draws its places through the theme**

`L/lernen-unit-page.tsx` — avval Read, keyin butun faylni yozing (o'zgarishlar: `SeansJoyi` olib tashlandi, `joy()` yordamchisi `tema.UnitJoyi` ni chaqiradi, `tartibMap`, `unitTartibi`):

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Screen,
  StackHeader,
  Stagger,
  Button,
  EmptyState,
  LoadingCards,
  ProgressBar,
} from "../lumio";
import { useT } from "@/i18n/use-t";
import { useLernenUnit } from "./queries";
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
import { seansHolatlari, type SeansHolatBelgisi } from "./fortschritt";
import { useKamHarakat } from "./harakat/use-kam-harakat";
import { ovozChal, ovozniUygot } from "./ovoz/ovoz";
import { sozHisoblagichi, type SozHisoblagichi } from "./soz-hisoblagichi";
import { useLernenTema } from "./tema/use-lernen-tema";
import type { TugunHolat, TugunTone } from "./tema/tema-turlari";
import { DARAJA_TONI } from "./tema/toza/toza-tugun-model";
import type { LernenSeans } from "./types";
import type { Translate } from "./liga";

/**
 * Seans nomi `kind`dan kelib chiqadi — MAVZU emas, A1 xaritasidagi
 * BOSQICH. `null` — eski DiB darsi, uning o'z nomi bor.
 */
function seansNomi(seans: LernenSeans, t: Translate): string {
  switch (seans.kind) {
    case "SECTION_A":
      return t("Tanishuv");
    case "SECTION_B":
      return t("Ishlatish");
    case "BRIDGE":
      return t("O'tish sinovi");
    case "UNIT_TEST":
      return t("Yakuniy sinov");
    default:
      return seans.titleUz ?? seans.titleDe;
  }
}

/** The lock chain's answer in the path's words. */
const TUGUN_HOLATI: Record<SeansHolatBelgisi, TugunHolat> = {
  BAJARILGAN: "done",
  NAVBATDAGI: "active",
  QULF: "locked",
};

/** The section's word counter: «So'zlar: 14 / 28» and a thin bar (ADR-0071). */
function SozlarQatori({ hisob }: { hisob: SozHisoblagichi }) {
  return (
    <div className="space-y-1 px-1">
      <p
        className={cn(
          "flex items-center gap-1 text-xs font-bold tabular-nums",
          hisob.tugadi ? "text-artikel-das" : "text-ink-600",
        )}
      >
        {hisob.tugadi ? <CheckCircle size={14} weight="fill" aria-hidden /> : null}
        {hisob.matn}
      </p>
      <ProgressBar
        value={hisob.foiz}
        height={6}
        color={hisob.tugadi ? "var(--success)" : "var(--coral-500)"}
      />
    </div>
  );
}

/**
 * Unit — bo'limlar ostida guruhlangan seanslar.
 *
 * Qulf butun UNIT bo'yicha hisoblanadi, bo'lim ichida emas: agar har
 * bo'lim o'z navbatini alohida hisoblasa, bir vaqtning o'zida uchta
 * seans «navbatdagi» bo'lib ko'rinardi (har bo'limda bittadan).
 *
 * The header and the places are the theme's (`LernenTema.UnitLavha`,
 * `LernenTema.UnitJoyi`; ADR-0128, ADR-0131): the page decides, the theme draws.
 */
export function LernenUnitPage({ unitId }: { unitId: number }) {
  const t = useT();
  const router = useRouter();
  const { tema } = useLernenTema();
  // Marks the less-motion state for CSS: the entrance stagger resolves at once (globals.css).
  const kam = useKamHarakat();
  const query = useLernenUnit(unitId);
  const { data } = query;

  // The sound engine is its own chunk and this page opens by URL too: load it
  // now, so on iOS/Telegram the unlock finds it ready inside the first tap.
  React.useEffect(() => {
    void import("./ovoz/ovoz-motor").catch(() => {});
  }, []);

  const holatMap = React.useMemo(() => {
    if (!data) return new Map<number, SeansHolatBelgisi>();
    const hammasi = [
      ...data.sections.flatMap((s) => s.lessons),
      ...(data.finalTest ? [data.finalTest] : []),
    ];
    const holatlar = seansHolatlari(hammasi);
    return new Map(hammasi.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  // Eski DiB uniti: bo'lim tushunchasi umuman yo'q, shuning uchun yassi
  // ro'yxat o'z navbatini alohida hisoblaydi (butun unit emas).
  const yassiHolatMap = React.useMemo(() => {
    if (!data || data.sections.length > 0) {
      return new Map<number, SeansHolatBelgisi>();
    }
    const holatlar = seansHolatlari(data.lessons);
    return new Map(data.lessons.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  // Each place's position on the page (the sections' lessons in order, then the
  // final test): a theme with a scene alternates the places' sides by it.
  const tartibMap = React.useMemo(() => {
    if (!data) return new Map<number, number>();
    const hammasi =
      data.sections.length > 0
        ? [...data.sections.flatMap((s) => s.lessons), ...(data.finalTest ? [data.finalTest] : [])]
        : data.lessons;
    return new Map(hammasi.map((l, i) => [l.id, i]));
  }, [data]);

  // Unlock first, inside the tap, then play: the audio context starts only in a gesture.
  const openLesson = (id: number) => {
    ovozniUygot();
    ovozChal("bos");
    router.push(`/portal/lernen/lessons/${id}`);
  };
  // A locked place answers with the short "locked" sound and opens nothing.
  const qulfBosildi = () => {
    ovozniUygot();
    ovozChal("qulf");
  };
  const tone: TugunTone = (data && DARAJA_TONI[data.level]) || "coral";

  // One lesson as the theme's place: the lock chain's answer and the
  // words-left caption (only under a finished section lesson), in the path's words.
  const joy = (seans: LernenSeans, belgi: SeansHolatBelgisi, yanaMashq?: string | null) => {
    const holat = TUGUN_HOLATI[belgi];
    const bolimDarsi = seans.kind === "SECTION_A" || seans.kind === "SECTION_B";
    return (
      <tema.UnitJoyi
        key={seans.id}
        label={seansNomi(seans, t)}
        kind={seans.kind}
        holat={holat}
        tone={tone}
        izoh={holat === "done" && bolimDarsi ? (yanaMashq ?? null) : null}
        tartib={tartibMap.get(seans.id) ?? 0}
        onClick={() => openLesson(seans.id)}
        onBosilmagan={qulfBosildi}
      />
    );
  };

  // A unit whose content is not written yet still has its seeded lessons;
  // the server says so with `bereit: false` (absent from an older server).
  const boshMi =
    data &&
    (data.bereit === false ||
      (data.sections.length === 0 && data.lessons.length === 0));

  return (
    // The marker sits on this outer root; the stagger below is strictly inside it (descendant selector).
    <Screen narrow data-kam-harakat={kam ? "" : undefined}>
      <StackHeader title={data?.titleUz ?? t("Bo'lim")} backHref="/portal/lernen" />

      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : boshMi ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title={t("Bu unitning mashqlari hali tayyor emas")}
          description={t("Material tez orada qo'shiladi.")}
          action={
            <Button
              variant="secondary"
              onClick={() => router.push("/portal/lernen")}
            >
              {t("Orqaga")}
            </Button>
          }
        />
      ) : data.sections.length > 0 ? (
        <Stagger className="space-y-5">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} unitTartibi={data.order} />

          {data.sections.map((section) => {
            const hisob = sozHisoblagichi(section.woerter, t);
            return (
              <section key={section.id} className="space-y-2">
                <div className="px-1">
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-600">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} /> : null}
                <div className="space-y-2">
                  {section.lessons.map((l) => joy(l, holatMap.get(l.id) ?? "QULF", hisob?.yanaMashq))}
                </div>
              </section>
            );
          })}

          {data.finalTest ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h2 className="px-1 font-display text-base font-extrabold text-ink-900">
                {t("Yakuniy sinov")}
              </h2>
              {joy(data.finalTest, holatMap.get(data.finalTest.id) ?? "QULF")}
            </section>
          ) : null}
        </Stagger>
      ) : (
        // Eski DiB uniti: bo'lim yo'q, darslar guruhsiz ro'yxat.
        <Stagger className="space-y-2">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} unitTartibi={data.order} />
          {data.lessons.map((l) => joy(l, yassiHolatMap.get(l.id) ?? "QULF"))}
        </Stagger>
      )}
    </Screen>
  );
}
```

- [ ] **Step 7: Register the new file for the i18n check**

`client/src/i18n/i18n-coverage.test.ts` — Old:

```ts
  "components/student-portal/lernen/tema/use-lernen-tema.ts",
```

New:

```ts
  "components/student-portal/lernen/tema/use-lernen-tema.ts",
  "components/student-portal/lernen/tema/toza/toza-unit-joyi.tsx",
```

(Yangi matn yo'q: `"{label} — hali ochilmagan"` va `"Boshlash"` lug'atlarda bor.)

- [ ] **Step 8: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema src/components/student-portal/lernen/lernen-unit-page.test.ts src/components/student-portal/student-portal-load-states.test.ts src/i18n`
Expected: PASS (unit sahifasining mavjud 10 ta testi o'zgarmasdan yashil: «Boshlash» bitta, `aria-disabled` ikkita, «Tanishuv — hali ochilmagan», amber izoh, to'q lab ustida «Boshlash»).

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz (shartnomada `UnitJoyi` majburiy — «Toza» uni beradi).

- [ ] **Step 9: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/tema-turlari.ts client/src/components/student-portal/lernen/tema/toza/toza-unit-joyi.tsx client/src/components/student-portal/lernen/tema/toza/toza-tema.ts client/src/components/student-portal/lernen/tema/toza/toza-orinlar.test.ts client/src/components/student-portal/lernen/tema/tema-reyestri.test.ts client/src/components/student-portal/lernen/lernen-unit-page.tsx client/src/i18n/i18n-coverage.test.ts
git commit -m "refactor(lernen): theme contract gains UnitJoyi, Sahna and Miniatyura slots

The unit page's place card moves verbatim into Toza's UnitJoyi, so a theme
with its own scene can draw lessons as places (ADR-0131).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client — sahnaning sof qarorlari (biom, reja, parallaks matematikasi)

**Files:**
- Create: `L/harakat/parallaks.ts`, `O/ormon-biom.ts`, `O/ormon-sahna-rejasi.ts`
- Test: `L/harakat/parallaks.test.ts`, `O/ormon-biom.test.ts`, `O/ormon-sahna-rejasi.test.ts`

**Interfaces:**
- Consumes: hech narsa (sof modullar).
- Produces:
  - `layerOffset(scrollY: number, factor: number, tile: number): number` — `(-tile, 0]` oralig'ida
  - `scenePaused(q: { hidden: boolean; offscreen: boolean }): boolean`
  - `BIOME_IDS = ["tong", "kol", "kuz"] as const`, `type BiomeId`, `interface BiomePalette { sky1; sky2; far; mid; near; glow: string }`, `BIOMES: Record<BiomeId, BiomePalette>`
  - `biomeForUnit(unitOrder: number): BiomeId`
  - `DARK_VEIL: { color: "#04120e"; alpha: 0.45 }`, `CARD_SURFACE_ALPHA = 0.9`, `ACCENT = "#0d6f5b"`
  - `type LayerId = "far" | "mid" | "near"`, `TILE = 640`, `LAYER_FACTOR: Record<LayerId, number>`, `LAYER_BLUR: Record<LayerId, number>`, `ELEMENT_BUDGET = 1500`
  - `interface ScenePlan { layers: { id: LayerId; count: number }[]; glows: number; sparks: number; leaves: number; mists: number; parallax: boolean }`
  - `scenePlan(q: { reduced: boolean; light: boolean }): ScenePlan`

- [ ] **Step 1: Write the failing tests**

`L/harakat/parallaks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { layerOffset, scenePaused } from "./parallaks";

describe("layerOffset", () => {
  it("moves a layer by its factor of the scroll, up the screen", () => {
    expect(layerOffset(0, 0.5, 640)).toBe(0);
    expect(layerOffset(100, 0.5, 640)).toBe(-50);
    expect(layerOffset(100, 0.2, 640)).toBeCloseTo(-20);
  });

  it("wraps every tile, so a layer never runs out however long the path is", () => {
    expect(layerOffset(1280, 0.5, 640)).toBe(0);
    expect(layerOffset(1300, 0.5, 640)).toBe(-10);
    expect(layerOffset(64_000, 0.5, 640)).toBe(0);
  });

  it("stays within one tile above its rest, also for the bounce above the top of the page", () => {
    for (const y of [-120, -1, 0, 1, 333, 639, 640, 641, 5_000, 123_457]) {
      const v = layerOffset(y, 0.5, 640);
      expect(v).toBeLessThanOrEqual(0);
      expect(v).toBeGreaterThan(-640);
    }
  });
});

describe("scenePaused", () => {
  it("holds the scene still while the tab is hidden or the scene is off screen", () => {
    expect(scenePaused({ hidden: false, offscreen: false })).toBe(false);
    expect(scenePaused({ hidden: true, offscreen: false })).toBe(true);
    expect(scenePaused({ hidden: false, offscreen: true })).toBe(true);
  });
});
```

`O/ormon-biom.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BIOME_IDS, BIOMES, biomeForUnit } from "./ormon-biom";

describe("biomeForUnit (spec §5 palitraUnitga)", () => {
  it("walks dawn, lake and autumn by the unit's order in its level, and starts over", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(biomeForUnit)).toEqual(["tong", "kol", "kuz", "tong", "kol", "kuz", "kuz"]);
  });

  it("gives a biome for an order it does not expect, never undefined", () => {
    for (const n of [0, -1, -5, 1.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(BIOME_IDS).toContain(biomeForUnit(n));
    }
    expect(biomeForUnit(Number.NaN)).toBe("tong");
  });
});

describe("BIOMES", () => {
  it("has the mockup's six colours for every biome", () => {
    for (const id of BIOME_IDS) {
      for (const c of Object.values(BIOMES[id])) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(Object.keys(BIOMES[id]).sort()).toEqual(["far", "glow", "mid", "near", "sky1", "sky2"]);
    }
  });
});
```

`O/ormon-sahna-rejasi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LAYER_FACTOR, scenePlan } from "./ormon-sahna-rejasi";

describe("scenePlan", () => {
  it("draws three layers back to front, with sparks, leaves, mist and glows, and runs the parallax", () => {
    expect(scenePlan({ reduced: false, light: false })).toEqual({
      layers: [
        { id: "far", count: 2 },
        { id: "mid", count: 8 },
        { id: "near", count: 3 },
      ],
      glows: 3,
      sparks: 4,
      leaves: 2,
      mists: 2,
      parallax: true,
    });
  });

  it("halves everything on a weak device and drops the far layer", () => {
    expect(scenePlan({ reduced: false, light: true })).toEqual({
      layers: [
        { id: "mid", count: 4 },
        { id: "near", count: 2 },
      ],
      glows: 2,
      sparks: 2,
      leaves: 1,
      mists: 1,
      parallax: true,
    });
  });

  it("is a still picture under «Kam harakat»: no parallax, no sparks, no falling leaves", () => {
    for (const light of [false, true]) {
      const plan = scenePlan({ reduced: true, light });
      expect(plan.parallax).toBe(false);
      expect(plan.sparks).toBe(0);
      expect(plan.leaves).toBe(0);
      expect(plan.layers.length).toBeGreaterThan(0);
    }
  });

  it("moves the far layer slowest and the near one fastest", () => {
    expect(LAYER_FACTOR.far).toBeLessThan(LAYER_FACTOR.mid);
    expect(LAYER_FACTOR.mid).toBeLessThan(LAYER_FACTOR.near);
    expect(LAYER_FACTOR.near).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/harakat/parallaks.test.ts src/components/student-portal/lernen/tema/ormon`
Expected: FAIL — `./parallaks`, `./ormon-biom`, `./ormon-sahna-rejasi` modullari topilmadi.

- [ ] **Step 3: Implement**

`L/harakat/parallaks.ts`:

```ts
/**
 * A scene layer's offset for a scroll position (spec §5): it moves `factor` px
 * up for every px scrolled and wraps every `tile`, so a layer of a few tiles
 * covers a path of any length. Always in `(-tile, 0]`.
 */
export function layerOffset(scrollY: number, factor: number, tile: number): number {
  const v = (((scrollY * factor) % tile) + tile) % tile;
  return v === 0 ? 0 : -v;
}

/** Parallax and the drifting decor hold still while the tab is hidden or the scene is off screen (spec §5). */
export function scenePaused(q: { hidden: boolean; offscreen: boolean }): boolean {
  return q.hidden || q.offscreen;
}
```

`O/ormon-biom.ts`:

```ts
/** The «O'rmon» theme's three biomes (spec §8): dawn, lake, autumn. */
export const BIOME_IDS = ["tong", "kol", "kuz"] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export interface BiomePalette {
  /** The sky gradient, top and bottom. */
  sky1: string;
  sky2: string;
  /** Far hills and trees, the middle trees, the near bushes at the edges. */
  far: string;
  mid: string;
  near: string;
  /** Light: the glow orbs, the sparks, the light shafts. */
  glow: string;
}

/** The CEO-approved mockup's colours (ormon2.html `PAL`). */
export const BIOMES: Record<BiomeId, BiomePalette> = {
  tong: { sky1: "#1f4d47", sky2: "#e8d9a6", far: "#a4c9b4", mid: "#3f8a72", near: "#1d5a4c", glow: "#fff1c4" },
  kol: { sky1: "#25506a", sky2: "#a4d2d8", far: "#aed5d8", mid: "#3f8c9c", near: "#235e70", glow: "#e4fbff" },
  kuz: { sky1: "#58383a", sky2: "#f0bd90", far: "#e4b498", mid: "#b8684f", near: "#7a403c", glow: "#ffe4bc" },
};

/** Dark mode: one still veil over the whole scene instead of a second set of colours. */
export const DARK_VEIL = { color: "#04120e", alpha: 0.45 } as const;

/** The place cards' surface over the scene is `bg-surface/90` (the contrast test reads this). */
export const CARD_SURFACE_ALPHA = 0.9;

/** The theme's own deep green: the «Boshlash» pill and the current place's ring (white text 6.1:1). */
export const ACCENT = "#0d6f5b";

/**
 * Spec §5 `palitraUnitga`: a unit's biome by its order in its level
 * (1 → tong, 2 → ko'l, 3 → kuz, 4 → tong …). The path and the unit page both
 * know the order, so the two screens agree without another request.
 */
export function biomeForUnit(unitOrder: number): BiomeId {
  const n = Number.isFinite(unitOrder) ? Math.trunc(unitOrder) : 1;
  return BIOME_IDS[(((n - 1) % 3) + 3) % 3];
}
```

`O/ormon-sahna-rejasi.ts`:

```ts
export type LayerId = "far" | "mid" | "near";

/** Height (px) of one tile of a layer: the layer repeats it and wraps, so the DOM never grows with the path. */
export const TILE = 640;

/** How far each layer moves per px of scroll: the farther, the slower (ormon2.html `FAC`). */
export const LAYER_FACTOR: Record<LayerId, number> = { far: 0.2, mid: 0.5, near: 0.8 };

/** The layer's blur (px), baked into its SVG once — never a CSS filter on a moving layer. */
export const LAYER_BLUR: Record<LayerId, number> = { far: 5, mid: 1.5, near: 2 };

/** The DOM/SVG budget of one scene (spec §11). */
export const ELEMENT_BUDGET = 1500;

export interface ScenePlan {
  /** Back to front; `count` = trees in one tile (far, mid) or bush clusters per edge (near). */
  layers: { id: LayerId; count: number }[];
  /** Soft glow orbs per biome. */
  glows: number;
  /** Fireflies drifting and blinking. */
  sparks: number;
  /** Leaves falling down the screen. */
  leaves: number;
  /** Mist bands drifting sideways. */
  mists: number;
  /** The layers follow the scroll. */
  parallax: boolean;
}

const LAYERS: { id: LayerId; count: number }[] = [
  { id: "far", count: 2 },
  { id: "mid", count: 8 },
  { id: "near", count: 3 },
];

/**
 * What the scene draws (spec §9). A weak device («yengil rejim») gets half:
 * no far layer, half the trees, glows, sparks, leaves and mist. «Kam harakat»
 * (system or device) is a still picture: no parallax, no sparks, no falling
 * leaves — the light shafts and the mist stay, but the CSS holds them still.
 */
export function scenePlan({ reduced, light }: { reduced: boolean; light: boolean }): ScenePlan {
  const half = (n: number) => (light ? Math.ceil(n / 2) : n);
  return {
    layers: LAYERS.filter((l) => !light || l.id !== "far").map((l) => ({ id: l.id, count: half(l.count) })),
    glows: half(3),
    sparks: reduced ? 0 : half(4),
    leaves: reduced ? 0 : half(2),
    mists: half(2),
    parallax: !reduced,
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/harakat/parallaks.test.ts src/components/student-portal/lernen/tema/ormon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/student-portal/lernen/harakat/parallaks.ts client/src/components/student-portal/lernen/harakat/parallaks.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-biom.ts client/src/components/student-portal/lernen/tema/ormon/ormon-biom.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-sahna-rejasi.ts client/src/components/student-portal/lernen/tema/ormon/ormon-sahna-rejasi.test.ts
git commit -m "feat(lernen): pure rules for the forest scene: biomes, plan, parallax

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — o'rmon shakllari (seed'li) va bitta qatlam (SVG plitka)

**Files:**
- Create: `O/ormon-shakllar.ts`, `O/ormon-qatlam.tsx`
- Test: `O/ormon-shakllar.test.ts`, `O/ormon-qatlam.test.ts`

**Interfaces:**
- Consumes: `TILE`, `LAYER_FACTOR`, `LAYER_BLUR`, `type LayerId` (`O/ormon-sahna-rejasi.ts`); `BIOMES`, `type BiomeId` (`O/ormon-biom.ts`).
- Produces:
  - `seededRandom(seed: number): () => number`
  - `interface Hill { kind: "hill"; cx: number; cy: number; rx: number; ry: number }`, `interface Tree { kind: "tree"; x: number; y: number; scale: number; opacity: number }`, `interface Bush { kind: "bush"; side: "left" | "right"; inset: number; cy: number; r: number }`, `type Shape = Hill | Tree | Bush`
  - `layerShapes(layer: LayerId, count: number, seed: number): Shape[]`
  - `interface Spark { left; top; dx; dy; drift; blink: number }`, `sparkSpecs(count: number, seed?: number): Spark[]`
  - `interface Leaf { left; fall; delay: number }`, `leafSpecs(count: number, seed?: number): Leaf[]`
  - `interface Glow { left; top; size; opacity: number }`, `glowSpecs(count: number, seed?: number): Glow[]`
  - `interface Mist { top; delay: number }`, `mistSpecs(count: number): Mist[]`
  - `OrmonQatlam({ biome, layer, count }: { biome: BiomeId; layer: LayerId; count: number })` — `<svg data-omil="…" class="ormon-layer …">`; id'lar `ormon-${biome}-${layer}-tile` / `-blur`.

- [ ] **Step 1: Write the failing tests**

`O/ormon-shakllar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { glowSpecs, layerShapes, leafSpecs, mistSpecs, seededRandom, sparkSpecs, type Bush, type Tree } from "./ormon-shakllar";

describe("seededRandom", () => {
  it("gives the same numbers for the same seed, so the server and the browser draw the same forest", () => {
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

describe("layerShapes", () => {
  it("is the same tile every time for a seed, another tile for another seed", () => {
    expect(layerShapes("mid", 8, 23)).toEqual(layerShapes("mid", 8, 23));
    expect(layerShapes("mid", 8, 23)).not.toEqual(layerShapes("mid", 8, 123));
  });

  it("far: a hill every 150 px down the tile and the asked number of big pale trees", () => {
    const shapes = layerShapes("far", 2, 11);
    expect(shapes.filter((s) => s.kind === "hill").map((s) => (s.kind === "hill" ? s.cy : 0))).toEqual([70, 220, 370, 520]);
    expect(shapes.filter((s) => s.kind === "tree")).toHaveLength(2);
  });

  it("mid: the asked number of trees across the width, the lower ones drawn last", () => {
    const trees = layerShapes("mid", 8, 23) as Tree[];
    expect(trees).toHaveLength(8);
    expect(trees.map((t) => t.y)).toEqual([...trees.map((t) => t.y)].sort((a, b) => a - b));
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(-3);
      expect(t.x).toBeLessThanOrEqual(103);
      expect(t.y).toBeLessThanOrEqual(640);
    }
  });

  it("near: three bushes per cluster on each edge, never in the middle of the path", () => {
    const bushes = layerShapes("near", 3, 37) as Bush[];
    expect(bushes).toHaveLength(18);
    expect(bushes.filter((b) => b.side === "left")).toHaveLength(9);
    for (const b of bushes) {
      expect(b.inset).toBeGreaterThanOrEqual(-32);
      expect(b.inset).toBeLessThanOrEqual(8);
    }
  });

  it("draws nothing for zero", () => {
    expect(layerShapes("mid", 0, 23)).toEqual([]);
    expect(layerShapes("near", 0, 37)).toEqual([]);
  });
});

describe("ambient specs", () => {
  it("give the asked number, the same every time", () => {
    expect(sparkSpecs(4)).toHaveLength(4);
    expect(sparkSpecs(4)).toEqual(sparkSpecs(4));
    expect(leafSpecs(2)).toHaveLength(2);
    expect(glowSpecs(3)).toHaveLength(3);
    expect(mistSpecs(2)).toEqual([
      { top: 18, delay: 0 },
      { top: 60, delay: 9 },
    ]);
  });

  it("keep the sparks on the screen and their motion small and slow", () => {
    for (const s of sparkSpecs(4)) {
      expect(s.left).toBeGreaterThanOrEqual(8);
      expect(s.left).toBeLessThanOrEqual(92);
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(26);
      expect(s.drift).toBeGreaterThanOrEqual(8);
    }
  });
});
```

`O/ormon-qatlam.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BIOMES, type BiomeId } from "./ormon-biom";
import { OrmonQatlam } from "./ormon-qatlam";
import type { LayerId } from "./ormon-sahna-rejasi";

const draw = (layer: LayerId, count: number, biome: BiomeId = "tong") =>
  renderToStaticMarkup(createElement(OrmonQatlam, { biome, layer, count }));
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;

describe("<OrmonQatlam />", () => {
  it("tells the parallax its factor and repeats one tile three times with <use>", () => {
    const html = draw("mid", 8);
    expect(html).toContain('data-omil="0.5"');
    expect(html.match(/<use /g)).toHaveLength(2);
    expect(html).toContain('href="#ormon-tong-mid-tile"');
    expect(html).toContain("height:calc(100% + 640px)");
  });

  it("blurs inside the SVG, never with a CSS filter on the moving layer", () => {
    const html = draw("far", 2);
    expect(html).toContain('<feGaussianBlur stdDeviation="5"');
    expect(html).not.toMatch(/style="[^"]*filter/);
  });

  it("paints in its biome's colour for its depth", () => {
    expect(draw("near", 3, "kuz")).toContain(`fill="${BIOMES.kuz.near}"`);
    expect(draw("mid", 8, "kol")).toContain(`fill="${BIOMES.kol.mid}"`);
  });

  it("is a few dozen elements, whatever the path's length", () => {
    expect(tags(draw("far", 2))).toBeLessThan(40);
    expect(tags(draw("mid", 8))).toBeLessThan(70);
    expect(tags(draw("near", 3))).toBeLessThan(40);
  });

  it("gives each biome and depth its own ids, so three biomes can stand on one page", () => {
    expect(draw("mid", 8, "kol")).toContain('id="ormon-kol-mid-blur"');
    expect(draw("mid", 8, "tong")).not.toEqual(draw("mid", 8, "kol"));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-shakllar.test.ts src/components/student-portal/lernen/tema/ormon/ormon-qatlam.test.ts`
Expected: FAIL — `./ormon-shakllar`, `./ormon-qatlam` topilmadi.

- [ ] **Step 3: Implement the shapes**

`O/ormon-shakllar.ts`:

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

/** A far hill: `cx` in percent of the scene's width, the rest in px. */
export interface Hill {
  kind: "hill";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A soft tree (a trunk and four round crowns) standing at `x` percent, `y` px. */
export interface Tree {
  kind: "tree";
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

/** A round bush hugging one edge, `inset` px in from it (negative: partly off screen). */
export interface Bush {
  kind: "bush";
  side: "left" | "right";
  inset: number;
  cy: number;
  r: number;
}

export type Shape = Hill | Tree | Bush;

/**
 * One tile of a layer (ormon2.html `farLayer` / `midLayer` / `nearLayer`, cut
 * to one tile): far — a hill every 150 px and `count` big pale trees; mid —
 * `count` trees, the lower ones drawn last; near — `count` clusters of three
 * bushes on each edge, so the middle, where the path is, stays calm.
 */
export function layerShapes(layer: LayerId, count: number, seed: number): Shape[] {
  const rnd = seededRandom(seed);
  if (layer === "far") {
    const hills: Hill[] = [];
    for (let y = 70; y < TILE; y += 150) {
      hills.push({
        kind: "hill",
        cx: r1(between(rnd, 8, 92)),
        cy: y,
        rx: r1(between(rnd, 170, 260)),
        ry: r1(between(rnd, 50, 80)),
      });
    }
    const trees = Array.from({ length: count }, (_, i): Tree => ({
      kind: "tree",
      x: r1(between(rnd, 5, 95)),
      y: r1(110 + (i * TILE) / count),
      scale: r1(between(rnd, 2.4, 3.4)),
      opacity: 0.4,
    }));
    return [...hills, ...trees];
  }
  if (layer === "mid") {
    const trees = Array.from({ length: count }, (): Tree => ({
      kind: "tree",
      x: r1(between(rnd, -3, 103)),
      y: r1(between(rnd, 120, TILE)),
      scale: r1(between(rnd, 1.7, 2.5)),
      opacity: r1(between(rnd, 0.55, 0.8)),
    }));
    return trees.sort((a, b) => a.y - b.y);
  }
  const bushes: Bush[] = [];
  for (const side of ["left", "right"] as const) {
    for (let i = 0; i < count; i++) {
      const y = (i + 0.5) * (TILE / count);
      for (let k = 0; k < 3; k++) {
        bushes.push({
          kind: "bush",
          side,
          inset: r1(between(rnd, -32, 8)),
          cy: r1(y + between(rnd, -50, 50)),
          r: r1(between(rnd, 40, 72)),
        });
      }
    }
  }
  return bushes;
}

/** A firefly: where it rests (percent of the scene), how far it drifts (px), its drift and blink periods (s). */
export interface Spark {
  left: number;
  top: number;
  dx: number;
  dy: number;
  drift: number;
  blink: number;
}

export function sparkSpecs(count: number, seed = 7): Spark[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (): Spark => ({
    left: r1(between(rnd, 8, 92)),
    top: r1(between(rnd, 15, 85)),
    dx: r1(between(rnd, -26, 26)),
    dy: r1(between(rnd, -26, 26)),
    drift: r1(between(rnd, 8, 13)),
    blink: r1(between(rnd, 3, 5)),
  }));
}

/** A falling leaf: its column (percent), the length of one fall and how far into it the leaf starts (s). */
export interface Leaf {
  left: number;
  fall: number;
  delay: number;
}

export function leafSpecs(count: number, seed = 13): Leaf[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): Leaf => ({
    left: r1(between(rnd, 10, 85)),
    fall: 20 + i * 6,
    delay: i * 11,
  }));
}

/** A soft glow orb behind the trees: its corner (percent), size (px) and strength. */
export interface Glow {
  left: number;
  top: number;
  size: number;
  opacity: number;
}

export function glowSpecs(count: number, seed = 29): Glow[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i): Glow => ({
    left: r1(between(rnd, -20, 60)),
    top: r1((100 / count) * i + between(rnd, 0, 12)),
    size: Math.round(between(rnd, 200, 280)),
    opacity: r1(between(rnd, 0.3, 0.5)),
  }));
}

/** A mist band: its height on the screen (percent) and how far into its drift it starts (s). */
export interface Mist {
  top: number;
  delay: number;
}

export function mistSpecs(count: number): Mist[] {
  return Array.from({ length: count }, (_, i): Mist => ({ top: 18 + i * 42, delay: i * 9 }));
}
```

- [ ] **Step 4: Implement the layer**

`O/ormon-qatlam.tsx`:

```tsx
import * as React from "react";
import { BIOMES, type BiomeId } from "./ormon-biom";
import { LAYER_BLUR, LAYER_FACTOR, TILE, type LayerId } from "./ormon-sahna-rejasi";
import { layerShapes, type Bush, type Hill, type Tree } from "./ormon-shakllar";

const LAYER_SEED: Record<LayerId, number> = { far: 11, mid: 23, near: 37 };
const BIOME_SEED: Record<BiomeId, number> = { tong: 0, kol: 100, kuz: 200 };

/** A soft tree drawn at its own origin (ormon2.html `soft`): a trunk and four round crowns. */
function SoftTree({ crown, trunk }: { crown: string; trunk: string }) {
  return (
    <>
      <rect x="-5" y="-50" width="10" height="50" rx="5" fill={trunk} opacity="0.6" />
      <circle cx="0" cy="-78" r="34" fill={crown} />
      <circle cx="-28" cy="-56" r="26" fill={crown} />
      <circle cx="28" cy="-56" r="26" fill={crown} />
      <circle cx="0" cy="-52" r="28" fill={crown} />
    </>
  );
}

/**
 * One depth layer of one biome: a 640 px tile of soft shapes drawn three times
 * with `<use>` and blurred once inside the SVG (rasterised once, then only
 * moved). It is the screen plus a tile tall, so the parallax (`useParallaks`
 * reads `data-omil`) can wrap it forever. Positions across are percentages, so
 * one tile fits a 360 px phone and a wide desktop alike.
 */
export const OrmonQatlam = React.memo(function OrmonQatlam({
  biome,
  layer,
  count,
}: {
  biome: BiomeId;
  layer: LayerId;
  count: number;
}) {
  const p = BIOMES[biome];
  const fill = p[layer];
  const shapes = layerShapes(layer, count, LAYER_SEED[layer] + BIOME_SEED[biome]);
  const hills = shapes.filter((s): s is Hill => s.kind === "hill");
  const trees = shapes.filter((s): s is Tree => s.kind === "tree");
  const bushes = shapes.filter((s): s is Bush => s.kind === "bush");
  const id = `ormon-${biome}-${layer}`;
  return (
    <svg
      data-omil={LAYER_FACTOR[layer]}
      aria-hidden="true"
      className="ormon-layer absolute inset-x-0 top-0 w-full"
      style={{ height: `calc(100% + ${TILE}px)` }}
    >
      <defs>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={LAYER_BLUR[layer]} />
        </filter>
      </defs>
      <g filter={`url(#${id}-blur)`}>
        <g id={`${id}-tile`}>
          {hills.map((h, i) => (
            <ellipse key={`h${i}`} cx={`${h.cx}%`} cy={h.cy} rx={h.rx} ry={h.ry} fill={fill} opacity="0.5" />
          ))}
          {trees.map((tr, i) => (
            <svg key={`t${i}`} x={`${tr.x}%`} y={tr.y} overflow="visible">
              <g transform={`scale(${tr.scale})`} opacity={tr.opacity}>
                <SoftTree crown={fill} trunk={p.near} />
              </g>
            </svg>
          ))}
          {bushes.length > 0 ? (
            <>
              <svg x="0" overflow="visible">
                {bushes
                  .filter((b) => b.side === "left")
                  .map((b, i) => (
                    <circle key={`l${i}`} cx={b.inset} cy={b.cy} r={b.r} fill={fill} opacity="0.85" />
                  ))}
              </svg>
              <svg x="100%" overflow="visible">
                {bushes
                  .filter((b) => b.side === "right")
                  .map((b, i) => (
                    <circle key={`r${i}`} cx={-b.inset} cy={b.cy} r={b.r} fill={fill} opacity="0.85" />
                  ))}
              </svg>
            </>
          ) : null}
        </g>
        <use href={`#${id}-tile`} y={TILE} />
        <use href={`#${id}-tile`} y={TILE * 2} />
      </g>
    </svg>
  );
});
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-shakllar.test.ts src/components/student-portal/lernen/tema/ormon/ormon-qatlam.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/ormon/ormon-shakllar.ts client/src/components/student-portal/lernen/tema/ormon/ormon-shakllar.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-qatlam.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-qatlam.test.ts
git commit -m "feat(lernen): seeded forest shapes and the wrapping SVG layer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — sahna harakati (CSS) va ambient (nur, tuman, uchqun, barg)

**Files:**
- Modify: `client/src/app/globals.css` (fayl OXIRIGA blok qo'shiladi)
- Create: `O/ormon-ambient.tsx`
- Test: `client/src/app/globals-css.test.ts` (qo'shiladi), `O/ormon-ambient.test.ts`

**Interfaces:**
- Consumes: `scenePlan`, `type ScenePlan` (`O/ormon-sahna-rejasi.ts`); `sparkSpecs`, `leafSpecs`, `mistSpecs` (`O/ormon-shakllar.ts`).
- Produces:
  - CSS sinflari (`.lumio` ichida): `.ormon-biome` (+`[data-faol]`), `.ormon-layer`, `.ormon-spark`, `.ormon-leaf`, `.ormon-rays`, `.ormon-mist`, `.ormon-vignette`, `.ormon-ring`, `.ormon-bob`, `.ormon-burst`; o'zgaruvchilar `--ormon-glow`, `--ormon-dx`, `--ormon-dy`, `--ormon-t`, `--ormon-b` (inline beriladi).
  - Atribut shartnomasi: ajdoddagi `data-tinch` — suzuvchi bezak to'xtaydi; ajdoddagi `data-kam-harakat` yoki tizim `prefers-reduced-motion` — hamma `ormon-*` animatsiya va biom almashuvi o'chadi.
  - `OrmonAmbient({ plan, glow }: { plan: ScenePlan; glow: string })`

- [ ] **Step 1: Write the failing tests**

`client/src/app/globals-css.test.ts` faylining OXIRIGA qo'shing (importlar allaqachon bor):

```ts
describe("the «O'rmon» scene's motion (ADR-0131)", () => {
  const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
  const flat = css.replace(/\s+/g, " ");
  const list = ":is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist, .ormon-ring, .ormon-burst, .ormon-bob)";

  it("animates only transform and opacity", () => {
    const frames = [...css.matchAll(/@keyframes (ormon-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1])).toEqual([
      "ormon-drift",
      "ormon-blink",
      "ormon-fall",
      "ormon-rays",
      "ormon-mist",
      "ormon-ring",
      "ormon-bob",
      "ormon-spin",
    ]);
    for (const [, name, body] of frames) {
      const props = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].filter((p) => p !== "transform" && p !== "opacity"), name).toEqual([]);
    }
  });

  it("holds the drifting decor still while the scene is paused", () => {
    expect(flat).toContain(
      ".lumio [data-tinch] :is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist) { animation-play-state: paused; }",
    );
  });

  it("stops every animation and the biome fade under the device's «Kam harakat» switch", () => {
    expect(flat).toContain(
      `.lumio [data-kam-harakat] ${list}, .lumio [data-kam-harakat] .ormon-biome { animation: none; transition: none; }`,
    );
  });

  it("does the same under the system setting, also for the visible biome", () => {
    expect(flat).toContain(
      `@media (prefers-reduced-motion: reduce) { .lumio ${list}, .lumio .ormon-biome, .lumio .ormon-biome[data-faol] { animation: none; transition: none; } }`,
    );
  });
});
```

`O/ormon-ambient.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrmonAmbient } from "./ormon-ambient";
import { scenePlan } from "./ormon-sahna-rejasi";

const draw = (reduced: boolean, light: boolean) =>
  renderToStaticMarkup(createElement(OrmonAmbient, { plan: scenePlan({ reduced, light }), glow: "#fff1c4" }));
const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}"`, "g")) ?? []).length;

describe("<OrmonAmbient />", () => {
  it("draws the plan's light: shafts, mist, fireflies and leaves, in the biome's glow", () => {
    const html = draw(false, false);
    expect(count(html, "ormon-rays")).toBe(1);
    expect(count(html, "ormon-mist")).toBe(2);
    expect(count(html, "ormon-spark")).toBe(4);
    expect(count(html, "ormon-leaf")).toBe(2);
    expect(html).toContain("--ormon-glow:#fff1c4");
  });

  it("halves the moving decor on a weak device", () => {
    const html = draw(false, true);
    expect(count(html, "ormon-spark")).toBe(2);
    expect(count(html, "ormon-leaf")).toBe(1);
    expect(count(html, "ormon-mist")).toBe(1);
  });

  it("draws no fireflies and no falling leaves under «Kam harakat»", () => {
    const html = draw(true, false);
    expect(count(html, "ormon-spark")).toBe(0);
    expect(count(html, "ormon-leaf")).toBe(0);
    expect(count(html, "ormon-rays")).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/app/globals-css.test.ts src/components/student-portal/lernen/tema/ormon/ormon-ambient.test.ts`
Expected: FAIL — `@keyframes ormon-*` topilmadi (`expected [] to deeply equal […]`), `./ormon-ambient` topilmadi.

- [ ] **Step 3: Add the motion to globals.css**

`client/src/app/globals.css` — faylning eng oxiridagi qoidadan keyin. Old:

```css
.lumio :focus-within > input:autofill,
.lumio :focus-within > textarea:autofill,
.lumio :focus-within > select:autofill {
  box-shadow: inset 0 0 0 1000px var(--surface-card);
}
```

New (old matn o'zgarmaydi, ostiga blok qo'shiladi; izohlar deklaratsiya ichida EMAS):

```css
.lumio :focus-within > input:autofill,
.lumio :focus-within > textarea:autofill,
.lumio :focus-within > select:autofill {
  box-shadow: inset 0 0 0 1000px var(--surface-card);
}

/* ============================================================
   Ta'lim · «O'rmon» theme (ADR-0131): the scene behind the path and
   the unit page, the node ring, the places and the reward. Only
   transform and opacity animate. Everything stops under the device's
   «Kam harakat» switch and the system setting; the drifting decor
   holds still while the scene is paused (data-tinch: the tab is
   hidden or the scene is off screen).
   ============================================================ */

/* One biome stack shows at a time; the hidden ones are not painted at
   all. A biome change is an opacity cross-fade. */
.lumio .ormon-biome {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 700ms var(--ease-in-out),
    visibility 0s linear 700ms;
}

.lumio .ormon-biome[data-faol] {
  opacity: 1;
  visibility: visible;
  transition:
    opacity 700ms var(--ease-in-out),
    visibility 0s;
}

/* Only the visible biome's layers get a compositor layer of their own. */
.lumio .ormon-biome[data-faol] .ormon-layer {
  will-change: transform;
}

.lumio .ormon-spark {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ormon-glow);
  box-shadow: 0 0 14px 5px color-mix(in srgb, var(--ormon-glow) 60%, transparent);
  animation:
    ormon-drift var(--ormon-t) ease-in-out infinite alternate,
    ormon-blink var(--ormon-b) ease-in-out infinite;
}

@keyframes ormon-drift {
  to {
    transform: translate(var(--ormon-dx), var(--ormon-dy));
  }
}

@keyframes ormon-blink {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 0.95;
  }
}

.lumio .ormon-leaf {
  position: absolute;
  top: 0;
  width: 14px;
  height: 14px;
  opacity: 0.8;
  animation: ormon-fall var(--ormon-t) linear infinite;
}

@keyframes ormon-fall {
  0% {
    transform: translate(0, -40px) rotate(0deg);
  }
  50% {
    transform: translate(-26px, 50vh) rotate(160deg);
  }
  100% {
    transform: translate(10px, 105vh) rotate(320deg);
  }
}

/* Light shafts: soft stripes, with no blur filter and no blend mode on a
   moving layer. */
.lumio .ormon-rays {
  position: absolute;
  top: 0;
  left: -60px;
  right: -60px;
  height: 70%;
  background: repeating-linear-gradient(
    106deg,
    transparent 0 60px,
    color-mix(in srgb, var(--ormon-glow) 14%, transparent) 90px,
    transparent 120px 210px
  );
  -webkit-mask-image: linear-gradient(#000, transparent 85%);
  mask-image: linear-gradient(#000, transparent 85%);
  animation: ormon-rays 30s ease-in-out infinite alternate;
}

@keyframes ormon-rays {
  from {
    transform: translateX(-30px);
    opacity: 0.6;
  }
  to {
    transform: translateX(30px);
    opacity: 1;
  }
}

.lumio .ormon-mist {
  position: absolute;
  left: -80px;
  width: calc(100% + 160px);
  height: 160px;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0));
  animation: ormon-mist 28s ease-in-out infinite alternate;
}

@keyframes ormon-mist {
  to {
    transform: translateX(24px);
  }
}

.lumio .ormon-vignette {
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.19) 100%);
}

/* The current node's ring rests invisible: with no animation it is simply
   not there. */
.lumio .ormon-ring {
  opacity: 0;
  animation: ormon-ring 2.6s ease-out infinite;
}

@keyframes ormon-ring {
  from {
    transform: scale(1);
    opacity: 0.6;
  }
  to {
    transform: scale(1.45);
    opacity: 0;
  }
}

/* The current place's emblem breathes. */
.lumio .ormon-bob {
  animation: ormon-bob 2.6s ease-in-out infinite;
}

@keyframes ormon-bob {
  50% {
    transform: translateY(-5px);
  }
}

/* The reward's slow sunburst. */
.lumio .ormon-burst {
  animation: ormon-spin 40s linear infinite;
}

@keyframes ormon-spin {
  to {
    transform: rotate(360deg);
  }
}

.lumio [data-tinch] :is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist) {
  animation-play-state: paused;
}

/* Later and as specific as the visible biome's rule, so it wins over it. */
.lumio [data-kam-harakat] :is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist, .ormon-ring, .ormon-burst, .ormon-bob),
.lumio [data-kam-harakat] .ormon-biome {
  animation: none;
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .lumio :is(.ormon-spark, .ormon-leaf, .ormon-rays, .ormon-mist, .ormon-ring, .ormon-burst, .ormon-bob),
  .lumio .ormon-biome,
  .lumio .ormon-biome[data-faol] {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 4: Implement the ambient light**

`O/ormon-ambient.tsx`:

```tsx
import type * as React from "react";
import type { ScenePlan } from "./ormon-sahna-rejasi";
import { leafSpecs, mistSpecs, sparkSpecs } from "./ormon-shakllar";

/** Inline style with the custom properties the CSS animations read (`--ormon-*`). */
const vars = (o: Record<string, string>) => o as React.CSSProperties;

/**
 * The scene's moving light (ormon2.html `.rays`, `.mist`, `.ff`, `.leaf`):
 * the light shafts and the mist always (held still under «Kam harakat»), the
 * fireflies and the falling leaves only as many as the plan allows. globals.css
 * moves them with transform and opacity only.
 */
export function OrmonAmbient({ plan, glow }: { plan: ScenePlan; glow: string }) {
  return (
    <div className="absolute inset-0" style={vars({ "--ormon-glow": glow })}>
      <div className="ormon-rays" />
      {mistSpecs(plan.mists).map((m, i) => (
        <div key={`m${i}`} className="ormon-mist" style={{ top: `${m.top}%`, animationDelay: `-${m.delay}s` }} />
      ))}
      {sparkSpecs(plan.sparks).map((s, i) => (
        <span
          key={`s${i}`}
          className="ormon-spark"
          style={vars({
            left: `${s.left}%`,
            top: `${s.top}%`,
            "--ormon-dx": `${s.dx}px`,
            "--ormon-dy": `${s.dy}px`,
            "--ormon-t": `${s.drift}s`,
            "--ormon-b": `${s.blink}s`,
          })}
        />
      ))}
      {leafSpecs(plan.leaves).map((l, i) => (
        <svg
          key={`l${i}`}
          className="ormon-leaf"
          viewBox="0 0 16 16"
          aria-hidden="true"
          style={vars({ left: `${l.left}%`, "--ormon-t": `${l.fall}s`, animationDelay: `-${l.delay}s` })}
        >
          <path d="M8 1C3 4 2 10 8 15c6-5 5-11 0-14z" fill="#d9a441" />
        </svg>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/app/globals-css.test.ts src/components/student-portal/lernen/tema/ormon/ormon-ambient.test.ts`
Expected: PASS (`globals-css.test.ts` ning eski testlari — `@theme` va `--amber-ink` — ham yashil).

- [ ] **Step 6: Commit**

```bash
git add client/src/app/globals.css client/src/app/globals-css.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-ambient.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-ambient.test.ts
git commit -m "feat(lernen): forest scene motion: sparks, leaves, light shafts, mist

Transform and opacity only; stopped by the less-motion switch and the system
setting, paused while the scene is hidden.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — O'rmon sahnasi (biomlar to'plami, parallaks, pauza, yengil rejim)

**Files:**
- Create: `L/harakat/use-sahna.ts`, `O/ormon-sahna.tsx`
- Test: `O/ormon-sahna.test.ts`

**Interfaces:**
- Consumes: `yengilRejimmi(q: { yadro?: number; xotira?: number }): boolean` (`L/harakat/kam-harakat.ts`); `useKamHarakat(): boolean` (`L/harakat/use-kam-harakat.ts`); `layerOffset`, `scenePaused` (Task 2); `BIOME_IDS`, `BIOMES`, `DARK_VEIL`, `biomeForUnit` (Task 2); `TILE`, `scenePlan`, `ELEMENT_BUDGET`, `type ScenePlan` (Task 2); `OrmonQatlam` (Task 3); `glowSpecs` (Task 3); `OrmonAmbient` (Task 4); `type SahnaProps` (Task 1).
- Produces:
  - `useYengilRejim(): boolean` — server/birinchi chizish `true`
  - `useSahnaPauza(ildiz: React.RefObject<HTMLElement | null>): boolean`
  - `useParallaks(ildiz: React.RefObject<HTMLElement | null>, o: { faol: boolean; tile: number; kalit: string }): void` — `[data-omil]` elementlarini siljitadi
  - `OrmonSahnaChizma(props: { unitTartibi: number; plan: ScenePlan; kam: boolean; tinch: boolean; ref?: React.Ref<HTMLDivElement> })` — ildiz `<div data-sahna="ormon" …>`, biom to'plamlari `<div data-biom="…" data-faol="">`
  - `OrmonSahna({ unitTartibi }: SahnaProps)` — tema `Sahna` o'rni (Task 8 ulaydi)

- [ ] **Step 1: Write the failing test**

`O/ormon-sahna.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The hook reads the device switch in an effect, which a static render never runs.
const kam = vi.hoisted(() => ({ on: false }));
vi.mock("../../harakat/use-kam-harakat", () => ({ useKamHarakat: () => kam.on }));

import { OrmonSahna, OrmonSahnaChizma } from "./ormon-sahna";
import { ELEMENT_BUDGET, scenePlan } from "./ormon-sahna-rejasi";

const chiz = (o: { unitTartibi?: number; reduced?: boolean; light?: boolean; tinch?: boolean }) =>
  renderToStaticMarkup(
    createElement(OrmonSahnaChizma, {
      unitTartibi: o.unitTartibi ?? 1,
      plan: scenePlan({ reduced: o.reduced ?? false, light: o.light ?? false }),
      kam: o.reduced ?? false,
      tinch: o.tinch ?? false,
    }),
  );
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length;

describe("<OrmonSahnaChizma />", () => {
  it("shows only the unit's biome; the other two wait hidden for the cross-fade", () => {
    const html = chiz({ unitTartibi: 2 });
    expect(html.match(/data-biom="/g)).toHaveLength(3);
    expect(html.match(/data-faol=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-biom="kol" data-faol=""/);
    expect(chiz({ unitTartibi: 6 })).toMatch(/data-biom="kuz" data-faol=""/);
  });

  it("stays within the element budget even in full detail (spec §11)", () => {
    const full = tags(chiz({}));
    expect(full).toBeLessThanOrEqual(ELEMENT_BUDGET);
    expect(tags(chiz({ light: true }))).toBeLessThan(full);
  });

  it("drops the far layer on a weak device", () => {
    expect(chiz({})).toContain('id="ormon-tong-far-tile"');
    expect(chiz({ light: true })).not.toContain("-far-tile");
  });

  it("marks its root for the CSS: still under «Kam harakat», held while paused", () => {
    expect(chiz({ reduced: true })).toMatch(/^<div[^>]*data-kam-harakat=""/);
    expect(chiz({ tinch: true })).toMatch(/^<div[^>]*data-tinch=""/);
    expect(chiz({})).not.toMatch(/^<div[^>]*data-(?:kam-harakat|tinch)/);
  });

  it("lays one still dark-mode veil over the scene, and nothing in it takes a backdrop blur", () => {
    const html = chiz({});
    expect(html).toContain("hidden dark:block");
    expect(html).not.toContain("backdrop-");
  });
});

describe("<OrmonSahna />", () => {
  it("first paints the light scene (the device has not answered yet) in the unit's biome", () => {
    kam.on = false;
    const html = renderToStaticMarkup(createElement(OrmonSahna, { unitTartibi: 3 }));
    expect(html).toContain('data-sahna="ormon"');
    expect(html).toMatch(/data-biom="kuz" data-faol=""/);
    expect(html).not.toContain("-far-tile");
  });

  it("is a still picture under «Kam harakat»: no fireflies, no falling leaves", () => {
    kam.on = true;
    const html = renderToStaticMarkup(createElement(OrmonSahna, { unitTartibi: 1 }));
    expect(html).not.toContain("ormon-spark");
    expect(html).not.toContain("ormon-leaf");
    kam.on = false;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-sahna.test.ts`
Expected: FAIL — `./ormon-sahna` topilmadi.

- [ ] **Step 3: Implement the scene hooks**

`L/harakat/use-sahna.ts`:

```ts
"use client";

import * as React from "react";
import { yengilRejimmi } from "./kam-harakat";
import { layerOffset, scenePaused } from "./parallaks";

const obunaYoq = () => () => {};

function qurilmaZaifmi(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number };
  return yengilRejimmi({ yadro: n.hardwareConcurrency, xotira: n.deviceMemory });
}

/**
 * A weak device draws the lighter scene (spec §9). The server and the first
 * paint assume the light one — a weak phone never pays for the full scene —
 * and the browser's answer replaces it after hydration.
 */
export function useYengilRejim(): boolean {
  return React.useSyncExternalStore(obunaYoq, qurilmaZaifmi, () => true);
}

/**
 * Whether the scene holds still: the tab is hidden (`visibilitychange`) or the
 * scene is off screen (`IntersectionObserver`). `false` on the server.
 */
export function useSahnaPauza(ildiz: React.RefObject<HTMLElement | null>): boolean {
  const [yashirin, setYashirin] = React.useState(false);
  const [ekrandaEmas, setEkrandaEmas] = React.useState(false);

  React.useEffect(() => {
    const yangila = () => setYashirin(document.visibilityState === "hidden");
    yangila();
    document.addEventListener("visibilitychange", yangila);
    const el = ildiz.current;
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([e]) => setEkrandaEmas(!e.isIntersecting))
        : null;
    if (el) io?.observe(el);
    return () => {
      document.removeEventListener("visibilitychange", yangila);
      io?.disconnect();
    };
  }, [ildiz]);

  return scenePaused({ hidden: yashirin, offscreen: ekrandaEmas });
}

/**
 * The scene's ONE `requestAnimationFrame` for the scroll parallax (spec §5):
 * every element under `ildiz` with `data-omil` (its factor) moves by
 * `layerOffset` from a passive scroll listener, at most once a frame. Off
 * (`faol` false: «Kam harakat» or paused) the layers rest where they are drawn.
 * `kalit` changes when the drawn layers change, so the list is read again.
 */
export function useParallaks(
  ildiz: React.RefObject<HTMLElement | null>,
  { faol, tile, kalit }: { faol: boolean; tile: number; kalit: string },
): void {
  React.useEffect(() => {
    const el = ildiz.current;
    if (!el) return;
    const qatlamlar = [...el.querySelectorAll<HTMLElement | SVGElement>("[data-omil]")];
    if (!faol) {
      for (const q of qatlamlar) q.style.transform = "";
      return;
    }
    let kadr = 0;
    const chiz = () => {
      kadr = 0;
      const y = window.scrollY;
      for (const q of qatlamlar) {
        q.style.transform = `translate3d(0, ${layerOffset(y, Number(q.dataset.omil), tile)}px, 0)`;
      }
    };
    const turtki = () => {
      if (!kadr) kadr = requestAnimationFrame(chiz);
    };
    chiz();
    window.addEventListener("scroll", turtki, { passive: true });
    return () => {
      window.removeEventListener("scroll", turtki);
      if (kadr) cancelAnimationFrame(kadr);
    };
  }, [ildiz, faol, tile, kalit]);
}
```

- [ ] **Step 4: Implement the scene**

`O/ormon-sahna.tsx`:

```tsx
"use client";

import * as React from "react";
import { useKamHarakat } from "../../harakat/use-kam-harakat";
import { useParallaks, useSahnaPauza, useYengilRejim } from "../../harakat/use-sahna";
import type { SahnaProps } from "../tema-turlari";
import { OrmonAmbient } from "./ormon-ambient";
import { BIOME_IDS, BIOMES, DARK_VEIL, biomeForUnit } from "./ormon-biom";
import { OrmonQatlam } from "./ormon-qatlam";
import { TILE, scenePlan, type ScenePlan } from "./ormon-sahna-rejasi";
import { glowSpecs } from "./ormon-shakllar";

export interface OrmonSahnaChizmaProps {
  unitTartibi: number;
  plan: ScenePlan;
  /** «Kam harakat»: marks the root, so the CSS stops every animation and the biome fade. */
  kam: boolean;
  /** The tab is hidden or the scene is off screen: the drifting decor holds still. */
  tinch: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Draws the «O'rmon» scene for a given plan — no hooks, so a test can render
 * any state. Three biome stacks (sky, glow orbs, the depth layers) stand on
 * the page and only the unit's biome shows (`data-faol`); the light, the
 * dark-mode veil and the vignette lie over them.
 */
export function OrmonSahnaChizma({ unitTartibi, plan, kam, tinch, ref }: OrmonSahnaChizmaProps) {
  const biome = biomeForUnit(unitTartibi);
  const glows = glowSpecs(plan.glows);
  return (
    <div
      ref={ref}
      data-sahna="ormon"
      data-kam-harakat={kam ? "" : undefined}
      data-tinch={tinch ? "" : undefined}
      className="absolute inset-0"
    >
      {BIOME_IDS.map((id) => {
        const p = BIOMES[id];
        return (
          <div key={id} data-biom={id} data-faol={id === biome ? "" : undefined} className="ormon-biome absolute inset-0">
            <div className="absolute inset-0" style={{ background: `linear-gradient(${p.sky1}, ${p.sky2})` }} />
            {glows.map((g, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${g.left}%`,
                  top: `${g.top}%`,
                  width: g.size,
                  height: g.size,
                  opacity: g.opacity,
                  background: `radial-gradient(closest-side, color-mix(in srgb, ${p.glow} 70%, transparent), transparent)`,
                }}
              />
            ))}
            {plan.layers.map((l) => (
              <OrmonQatlam key={l.id} biome={id} layer={l.id} count={l.count} />
            ))}
          </div>
        );
      })}
      <OrmonAmbient plan={plan} glow={BIOMES[biome].glow} />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: DARK_VEIL.color, opacity: DARK_VEIL.alpha }}
      />
      <div className="ormon-vignette absolute inset-0" />
    </div>
  );
}

/**
 * «O'rmon»'s `Sahna` (spec §8, ADR-0131): three biomes by the unit, a scroll
 * parallax, fireflies, light shafts and mist. A weak device draws half,
 * «Kam harakat» a still picture, and it holds still while hidden.
 */
export function OrmonSahna({ unitTartibi }: SahnaProps) {
  const kam = useKamHarakat();
  const yengil = useYengilRejim();
  const ildiz = React.useRef<HTMLDivElement>(null);
  const tinch = useSahnaPauza(ildiz);
  const plan = React.useMemo(() => scenePlan({ reduced: kam, light: yengil }), [kam, yengil]);
  useParallaks(ildiz, {
    faol: plan.parallax && !tinch,
    tile: TILE,
    kalit: plan.layers.map((l) => `${l.id}${l.count}`).join(),
  });
  return <OrmonSahnaChizma ref={ildiz} unitTartibi={unitTartibi} plan={plan} kam={kam} tinch={tinch} />;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon src/components/student-portal/lernen/harakat`
Expected: PASS (to'liq sahna ~400 element, `ELEMENT_BUDGET` 1500 dan ancha past).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/harakat/use-sahna.ts client/src/components/student-portal/lernen/tema/ormon/ormon-sahna.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-sahna.test.ts
git commit -m "feat(lernen): the forest scene: biome stacks, one-frame parallax, pause

One requestAnimationFrame per scene, paused while the tab is hidden or the scene
is off screen; a weak device draws half, less motion a still picture.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — O'rmon tuguni (`TugunBelgisi`)

**Files:**
- Create: `O/ormon-tugun.tsx`
- Test: `O/ormon-tugun.test.ts`
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`)

**Interfaces:**
- Consumes: `type TugunBelgisiProps`, `type TugunHolat` (`L/tema/tema-turlari.ts`); CSS `.ormon-ring` (Task 4).
- Produces: `OrmonTugun(props: TugunBelgisiProps)` — ildiz `<div data-tugun="ormon">`; Task 8 ulaydi.

- [ ] **Step 1: Write the failing test**

`O/ormon-tugun.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TugunBelgisiProps } from "../tema-turlari";
import { OrmonTugun } from "./ormon-tugun";

const render = (p: Partial<TugunBelgisiProps>) =>
  renderToStaticMarkup(
    createElement(OrmonTugun, { label: "Tanishuv", holat: "active", tone: "coral", onClick: () => {}, ...p }),
  );

describe("<OrmonTugun />", () => {
  it("the current node is a lit orb with a ring, pressable and named by its section", () => {
    const html = render({});
    expect(html).toContain('data-tugun="ormon"');
    expect(html).toContain('aria-label="Tanishuv"');
    expect(html).toContain("ormon-ring");
    expect(html).not.toContain("aria-disabled");
  });

  it("a locked node stays pressable (it plays the locked sound) but says it is closed", () => {
    const html = render({ holat: "locked", onClick: undefined, onBosilmagan: () => {} });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).not.toContain("ormon-ring");
  });

  it("a finished node is the gold orb, whatever the level colour", () => {
    expect(render({ holat: "done", tone: "teal" })).toBe(render({ holat: "done", tone: "grape" }));
    expect(render({ holat: "done" })).toContain("#f2cd7a");
  });

  it("writes its name on a plain surface pill in the darkest ink, readable over any part of the scene", () => {
    const html = render({});
    expect(html).toMatch(/bg-surface[^"]*text-ink-900[^"]*">Tanishuv</);
    expect(html).not.toMatch(/\btext-ink-(?:400|500)\b/);
    expect(html).not.toContain("backdrop-");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-tugun.test.ts`
Expected: FAIL — `./ormon-tugun` topilmadi.

- [ ] **Step 3: Implement**

`O/ormon-tugun.tsx`:

```tsx
"use client";

import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";

/**
 * The orb of each state (ormon2.html `.node.done / .cur / .lock`): lit gold, a
 * mint glow, a pale frosted stone (a translucent surface, no backdrop blur —
 * the scene moves under it on every scroll frame). The level colour is not
 * used: the forest has its own light; the sticky banner still shows the level.
 */
const SHAR: Record<TugunHolat, { fon: string; soya: string; belgi: string }> = {
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

/**
 * «O'rmon»'s path node. The current one wears a breathing ring (transform and
 * opacity only, `.ormon-ring`). A locked node is still a button — the student
 * gets the soft "locked" answer — but it says it is closed to screen readers.
 * The name sits on a plain surface pill, so it reads over any part of the scene.
 */
export function OrmonTugun({ label, holat, onClick, onBosilmagan }: TugunBelgisiProps) {
  const t = useT();
  const locked = holat === "locked";
  const shar = SHAR[holat];
  const Icon = holat === "done" ? Check : holat === "active" ? Star : LockSimple;
  return (
    <div data-tugun="ormon" className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span
            aria-hidden
            className="ormon-ring absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 10px rgba(166, 253, 232, 0.55)" }}
          />
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
          style={{ background: shar.fon, boxShadow: shar.soya, color: shar.belgi }}
        >
          <Icon size={28} weight="fill" />
        </button>
      </div>
      <span className="max-w-[120px] truncate rounded-full bg-surface px-2.5 py-0.5 text-center text-xs font-bold text-ink-900 shadow-lumio-sm">
        {label}
      </span>
    </div>
  );
}
```

`client/src/i18n/i18n-coverage.test.ts` — Old:

```ts
  "components/student-portal/lernen/tema/toza/toza-unit-joyi.tsx",
```

New:

```ts
  "components/student-portal/lernen/tema/toza/toza-unit-joyi.tsx",
  "components/student-portal/lernen/tema/ormon/ormon-tugun.tsx",
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-tugun.test.ts src/i18n`
Expected: PASS (yangi lug'at yozuvi kerak emas: `"{label} — hali ochilmagan"` bor).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/ormon/ormon-tugun.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-tugun.test.ts client/src/i18n/i18n-coverage.test.ts
git commit -m "feat(lernen): forest path node: gold, mint and frosted-stone orbs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — unit sahifasi: o'rmondagi joylar (`UnitJoyi`), lavha (`UnitLavha`), kontrast

**Files:**
- Create: `O/ormon-joy-belgilari.tsx`, `O/ormon-joy.tsx`, `O/ormon-unit-lavha.tsx`, `client/src/test-support/hex-contrast.ts`
- Test: `O/ormon-joy.test.ts`, `O/ormon-kontrast.test.ts`
- Modify: `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`)

**Interfaces:**
- Consumes: `type UnitJoyiProps`, `type UnitLavhaProps`, `type TugunHolat` (Task 1); `ACCENT`, `BIOMES`, `BIOME_IDS`, `CARD_SURFACE_ALPHA`, `DARK_VEIL`, `biomeForUnit`, `type BiomeId` (Task 2); `Dafi` (`L/dafi/dafi.tsx`, `holat="salom"` → `data-holat="salom"`); CSS `.ormon-bob` (Task 4); `type DafLessonKind` (`L/types.ts`).
- Produces:
  - `type JoyId = "kulba" | "koprik" | "gor" | "qala"`, `placeForKind(kind: DafLessonKind | null): JoyId`, `JOY_BELGISI: Record<JoyId, (p: { className?: string }) => React.JSX.Element>`
  - `OrmonJoy(props: UnitJoyiProps)` — `<button data-joy="…">`, qulfda `<span data-tuman="">`
  - `OrmonUnitLavha(props: UnitLavhaProps)` — `<div data-lavha-biom="…">`
  - Test yordamchilari: `hexLuminance(hex)`, `hexContrast(a, b)`, `mixHex(top, bottom, alpha)`, `cssHexToken(css, selector, token)` (`@/test-support/hex-contrast`)

- [ ] **Step 1: Write the failing tests**

`O/ormon-joy.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UnitJoyiProps } from "../tema-turlari";
import { ACCENT, BIOMES } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";
import { OrmonJoy } from "./ormon-joy";
import { OrmonUnitLavha } from "./ormon-unit-lavha";

const joy = (p: Partial<UnitJoyiProps>) =>
  renderToStaticMarkup(
    createElement(OrmonJoy, {
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

describe("placeForKind (spec §8)", () => {
  it("is a hut, a bridge, a cave and a castle along the unit; an old lesson is a hut", () => {
    expect(placeForKind("SECTION_A")).toBe("kulba");
    expect(placeForKind("SECTION_B")).toBe("koprik");
    expect(placeForKind("BRIDGE")).toBe("gor");
    expect(placeForKind("UNIT_TEST")).toBe("qala");
    expect(placeForKind(null)).toBe("kulba");
  });

  it("gives every place a small, still emblem", () => {
    for (const Belgi of Object.values(JOY_BELGISI)) {
      const html = renderToStaticMarkup(createElement(Belgi, {}));
      expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect((html.match(/<[a-zA-Z]/g) ?? []).length).toBeLessThanOrEqual(10);
    }
  });
});

describe("<OrmonJoy />", () => {
  it("draws the lesson as its place in the forest", () => {
    expect(joy({ kind: "BRIDGE" })).toContain('data-joy="gor"');
    expect(joy({ kind: "UNIT_TEST" })).toContain('data-joy="qala"');
  });

  it("offers «Boshlash» on the accent only on the current place, and its emblem breathes", () => {
    const html = joy({});
    expect(html).toContain(`style="background:${ACCENT}">Boshlash<`);
    expect(html).toContain("ormon-bob");
    expect(joy({ holat: "done" })).not.toContain("Boshlash");
  });

  it("keeps a locked place pressable for the locked sound, tells it is closed, and covers it in fog", () => {
    const html = joy({ holat: "locked" });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="Tanishuv — hali ochilmagan"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
    expect(html).toContain("data-tuman");
    expect(joy({})).not.toContain("data-tuman");
  });

  it("alternates sides down the page", () => {
    expect(joy({ tartib: 1 })).toContain("flex-row-reverse");
    expect(joy({ tartib: 2 })).not.toContain("flex-row-reverse");
  });

  it("sits on the 90% surface with no backdrop blur and writes only readable inks", () => {
    const html = joy({ holat: "done", izoh: "Yana mashq qilish · 14 yangi so'z" });
    expect(html).toContain("bg-surface/90");
    expect(html).not.toContain("backdrop-");
    expect(html).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
    expect(html).toMatch(/text-\[var\(--amber-ink\)\][^>]*>Yana mashq qilish/);
  });
});

describe("<OrmonUnitLavha />", () => {
  const html = (unitTartibi?: number) =>
    renderToStaticMarkup(createElement(OrmonUnitLavha, { daraja: "A1", matn: "A1 · Zahlen", unitTartibi }));

  it("is the unit's biome banner with its line and Dafi waving hello", () => {
    const h = html(2);
    expect(h).toContain("A1 · Zahlen");
    expect(h).toContain('data-lavha-biom="kol"');
    expect(h).toContain(`background:${BIOMES.kol.near}`);
    expect(h).toContain('data-holat="salom"');
  });

  it("is the dawn when the order is not given, and screen readers read it", () => {
    expect(html()).toContain('data-lavha-biom="tong"');
    expect(html()).not.toMatch(/^<div[^>]*aria-hidden/);
  });
});
```

`O/ormon-kontrast.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cssHexToken, hexContrast, mixHex } from "@/test-support/hex-contrast";
import { ACCENT, BIOME_IDS, BIOMES, CARD_SURFACE_ALPHA, DARK_VEIL } from "./ormon-biom";

// Read from the stylesheet and the palette, so a token or a colour change that
// breaks the contrast fails here instead of on a student's phone.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MODES = [
  { name: "light", selector: ".lumio", scene: (c: string) => c },
  { name: "dark", selector: ".dark .lumio", scene: (c: string) => mixHex(DARK_VEIL.color, c, DARK_VEIL.alpha) },
] as const;
const sceneColours = BIOME_IDS.flatMap((id) => Object.values(BIOMES[id]));

describe("the place card's text over the forest (spec §11: 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: the name, the dark ink and the words-left caption hold over every scene colour`, () => {
      const surface = cssHexToken(css, mode.selector, "surface-card");
      for (const c of sceneColours) {
        const card = mixHex(surface, mode.scene(c), CARD_SURFACE_ALPHA);
        for (const token of ["ink-900", "ink-600", "amber-ink"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), card),
            `${mode.name}: ${token} on the card over ${c}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});

describe("the forest's own coloured labels", () => {
  it("the unit banner's white text holds on every biome's deep green", () => {
    for (const id of BIOME_IDS) expect(hexContrast("#ffffff", BIOMES[id].near), id).toBeGreaterThanOrEqual(4.5);
  });

  it("the «Boshlash» pill's white text holds on the accent", () => {
    expect(hexContrast("#ffffff", ACCENT)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-joy.test.ts src/components/student-portal/lernen/tema/ormon/ormon-kontrast.test.ts`
Expected: FAIL — `./ormon-joy-belgilari`, `./ormon-joy`, `./ormon-unit-lavha`, `@/test-support/hex-contrast` topilmadi.

- [ ] **Step 3: Add the contrast helper (tests only)**

`client/src/test-support/hex-contrast.ts`:

```ts
/** sRGB relative luminance of a `#rrggbb` colour (WCAG 2). */
export function hexLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function hexContrast(a: string, b: string): number {
  const [hi, lo] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` laid over `bottom` at `top`'s opacity `alpha`, as `#rrggbb`. */
export function mixHex(top: string, bottom: string, alpha: number): string {
  const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [t, b] = [ch(top), ch(bottom)];
  return `#${t
    .map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * A `--token: #rrggbb;` value from the first block of a stylesheet opened by
 * `selector` at the start of a line (".lumio", ".dark .lumio").
 */
export function cssHexToken(css: string, selector: string, token: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
  const m = block.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${token} not found in ${selector}`);
  return m[1].toLowerCase();
}
```

- [ ] **Step 4: Implement the place emblems**

`O/ormon-joy-belgilari.tsx`:

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
    case "SECTION_B":
      return "koprik";
    case "BRIDGE":
      return "gor";
    case "UNIT_TEST":
      return "qala";
    default:
      return "kulba";
  }
}

interface BelgiProps {
  className?: string;
}

/** A hut with a lit window. */
function Kulba({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="56" rx="26" ry="5" fill="#3f8a72" opacity="0.35" />
      <rect x="14" y="30" width="36" height="24" rx="5" fill="#c98b5a" />
      <path d="M8 33 32 12l24 21z" fill="#7a4a2c" />
      <rect x="27" y="39" width="10" height="15" rx="3" fill="#5a341f" />
      <rect x="40" y="36" width="7" height="7" rx="2" fill="#ffe9a8" />
    </svg>
  );
}

/** A wooden bridge over a stream. */
function Koprik({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <ellipse cx="32" cy="54" rx="28" ry="6" fill="#7fc3d0" opacity="0.6" />
      <path d="M6 44q26-26 52 0" fill="none" stroke="#8a5a3a" strokeWidth="6" strokeLinecap="round" />
      <rect x="4" y="40" width="56" height="6" rx="3" fill="#b07a4f" />
      <path d="M12 40v-8M22 36v-9M32 34v-10M42 36v-9M52 40v-8" stroke="#8a5a3a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A cave in a mossy hill. */
function Gor({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M4 56 22 18l10 10 8-12 20 40z" fill="#7d8a8f" />
      <path d="M20 56q12-26 24 0z" fill="#2c3438" />
      <ellipse cx="14" cy="55" rx="10" ry="4" fill="#3f8a72" />
      <ellipse cx="52" cy="55" rx="9" ry="4" fill="#3f8a72" />
    </svg>
  );
}

/** A small castle with a flag. */
function Qala({ className }: BelgiProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="10" y="22" width="12" height="34" rx="2" fill="#a99bc4" />
      <rect x="42" y="22" width="12" height="34" rx="2" fill="#a99bc4" />
      <rect x="18" y="30" width="28" height="26" rx="2" fill="#bfb3d6" />
      <path d="M27 56V46a5 5 0 0 1 10 0v10z" fill="#5d4f7a" />
      <path d="M10 22v-5h4v3h4v-3h4v5zM42 22v-5h4v3h4v-3h4v5z" fill="#8d7fb0" />
      <path d="M48 17V5" stroke="#5d4f7a" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 5l9 3-9 3z" fill="#ff8466" />
    </svg>
  );
}

/** The emblem of each place: hand-drawn, still SVG (the mockup's emoji are not used, spec §14). */
export const JOY_BELGISI: Record<JoyId, (p: BelgiProps) => React.JSX.Element> = {
  kulba: Kulba,
  koprik: Koprik,
  gor: Gor,
  qala: Qala,
};
```

- [ ] **Step 5: Implement the place card**

`O/ormon-joy.tsx`:

```tsx
"use client";

import { Check, LockSimple, Play } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { ACCENT } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";

/** The light behind the emblem, per state (ormon2.html `.pl::before`, `.pl.done`, `.pl.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(255, 233, 162, 0.8), rgba(255, 233, 162, 0))",
  active: "radial-gradient(closest-side, rgba(166, 253, 232, 0.85), rgba(166, 253, 232, 0))",
  locked: "radial-gradient(closest-side, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0))",
};

/** The corner badge, per state (ormon2.html `.pl .bd`). */
const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#f2cd7a", rang: "#5a3d10" },
  active: { fon: "#86ead2", rang: "#0d4a3d" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Fog over a locked place's emblem (ormon2.html `.pl.lock::after`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0))";

/**
 * «O'rmon»: one lesson as a place in the forest (spec §8) — a hut, a bridge, a
 * cave or a castle by the lesson's step, alternating sides down the page. The
 * current place glows, its emblem breathes and it offers «Boshlash»; a locked
 * one is covered in fog, stays a button (the short "locked" sound) and tells
 * screen readers it is closed. The card is a 90% surface with no backdrop
 * blur: the scene moves under it on every scroll frame.
 */
export function OrmonJoy({ label, kind, holat, izoh, tartib, onClick, onBosilmagan }: UnitJoyiProps) {
  const t = useT();
  const joy = placeForKind(kind);
  const Belgi = JOY_BELGISI[joy];
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
      style={joriy ? { boxShadow: `0 0 0 2px ${ACCENT}, 0 0 40px rgba(166, 253, 232, 0.4)` } : undefined}
    >
      <span aria-hidden className="relative grid size-20 shrink-0 place-items-center">
        <span className="absolute -inset-3 rounded-full" style={{ background: NUR[holat] }} />
        <Belgi className={cn("relative size-16", joriy && "ormon-bob", qulf && "opacity-60 grayscale")} />
        {qulf ? <span data-tuman="" className="absolute inset-0 rounded-full" style={{ background: TUMAN }} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-lg font-extrabold text-ink-900">{label}</span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">{izoh}</span>
        ) : null}
        {joriy ? (
          <span
            className="mt-1.5 inline-block rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
            style={{ background: ACCENT }}
          >
            {t("Boshlash")}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn("absolute top-3 grid size-7 place-items-center rounded-full", ongda ? "left-3" : "right-3")}
        style={{ background: NISHON[holat].fon, color: NISHON[holat].rang }}
      >
        <Nishon size={14} weight="bold" />
      </span>
    </button>
  );
}
```

- [ ] **Step 6: Implement the unit banner**

`O/ormon-unit-lavha.tsx`:

```tsx
"use client";

import type * as React from "react";
import { Dafi } from "../../dafi/dafi";
import type { UnitLavhaProps } from "../tema-turlari";
import { BIOMES, biomeForUnit, type BiomeId } from "./ormon-biom";

/** The dawn sun. */
function TongBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="15" r="5" fill="#fff1c4" />
      <path d="M3 20h18M12 4v3M5 9l2 2M19 9l-2 2" stroke="#fff1c4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** The lake's waves. */
function KolBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path
        d="M3 10q3-3 6 0t6 0 6 0M3 16q3-3 6 0t6 0 6 0"
        fill="none"
        stroke="#e4fbff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** An autumn leaf. */
function KuzBelgisi() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <path d="M12 3C6 7 5 14 12 21c7-7 6-14 0-18z" fill="#ffe4bc" />
      <path d="M12 7v14" stroke="#7a403c" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const BIOM_BELGISI: Record<BiomeId, () => React.JSX.Element> = {
  tong: TongBelgisi,
  kol: KolBelgisi,
  kuz: KuzBelgisi,
};

/**
 * «O'rmon»: the unit page's header in the unit's biome — its deep green (white
 * text 7.2–8.0:1, `ormon-kontrast.test.ts`), the biome's sign, the unit's line
 * and Dafi waving hello. Read by screen readers: it is the only place the
 * unit's German title is shown.
 */
export function OrmonUnitLavha({ matn, unitTartibi = 1 }: UnitLavhaProps) {
  const biome = biomeForUnit(unitTartibi);
  const Belgi = BIOM_BELGISI[biome];
  return (
    <div
      data-lavha-biom={biome}
      className="flex items-center gap-3 rounded-[26px] p-2 text-white shadow-[0_12px_30px_rgba(0,0,0,.18)]"
      style={{ background: BIOMES[biome].near }}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
        <Belgi />
      </span>
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
```

`client/src/i18n/i18n-coverage.test.ts` — Old:

```ts
  "components/student-portal/lernen/tema/ormon/ormon-tugun.tsx",
```

New:

```ts
  "components/student-portal/lernen/tema/ormon/ormon-tugun.tsx",
  "components/student-portal/lernen/tema/ormon/ormon-joy.tsx",
```

- [ ] **Step 7: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon src/i18n`
Expected: PASS. Kontrast: yorug' rejimda eng past — `amber-ink` (~4.8:1), qorong'uda `ink-600` (~6:1); lavha oq matni 7.2–8.0:1; «Boshlash» 6.1:1.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/ormon/ormon-joy-belgilari.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-joy.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-unit-lavha.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-joy.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-kontrast.test.ts client/src/test-support/hex-contrast.ts client/src/i18n/i18n-coverage.test.ts
git commit -m "feat(lernen): forest places (hut, bridge, cave, castle) and the biome banner

Locked places are covered in fog; text contrast over the scene is measured from
the stylesheet and the palette.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — mukofot foni, temaning yig'masi va reyestr

**Files:**
- Modify: `client/src/app/globals.css` (`.lumio` va `.dark .lumio` bloklariga `--ormon-*` tokenlari)
- Create: `O/ormon-mukofot-foni.tsx`, `O/ormon-tema.ts`
- Modify: `L/tema/tema-reyestri.ts`
- Test: `O/ormon-tema.test.ts` (yangi), `O/ormon-kontrast.test.ts` (qo'shiladi)

**Interfaces:**
- Consumes: `type MukofotFoniProps`, `type LernenTema` (Task 1); `OrmonTugun` (Task 6), `OrmonJoy`, `OrmonUnitLavha` (Task 7), `OrmonSahna` (Task 5); CSS `.ormon-burst` (Task 4); `cssHexToken`, `hexContrast`, `mixHex` (Task 7).
- Produces:
  - Tokenlar: `--ormon-mukofot-ust`, `--ormon-mukofot-ost`, `--ormon-tepalik` (hex), `--ormon-mukofot-nur` (`rgba(…)`) — ikkala blokda.
  - `OrmonMukofotFoni(props: MukofotFoniProps)` — `<div data-mukofot="ormon">`
  - `ormonTema: LernenTema` (`id: "ormon"`; `Miniatyura` Task 10 da qo'shiladi)
  - `TEMALAR.ormon` — `temaTop("ormon")` endi `ormonTema` qaytaradi (Sozlamalarda hali taklif qilinmaydi: `tayyor: false`, Task 10).

- [ ] **Step 1: Write the failing tests**

`O/ormon-tema.test.ts`:

```ts
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { temaTop } from "../tema-reyestri";
import { OrmonMukofotFoni } from "./ormon-mukofot-foni";
import { ormonTema } from "./ormon-tema";

// `children` is the third argument (react/no-children-prop); the cast keeps `tsc`
// from asking for it in the props.
const foni = (bayram: boolean) =>
  renderToStaticMarkup(
    createElement(OrmonMukofotFoni, { bayram } as ComponentProps<typeof OrmonMukofotFoni>, "Dars tugadi!"),
  );

describe("<OrmonMukofotFoni />", () => {
  it("is a forest clearing around the reward, drawn in the theme's tokens", () => {
    const html = foni(false);
    expect(html).toContain("Dars tugadi!");
    expect(html).toContain("var(--ormon-mukofot-ust)");
    expect(html).toContain("var(--ormon-tepalik)");
  });

  it("turns a slow sunburst only for a celebration", () => {
    expect(foni(true)).toContain("ormon-burst");
    expect(foni(false)).not.toContain("ormon-burst");
  });
});

describe("the «O'rmon» theme", () => {
  it("is in the registry and brings every slot, its own scene included", () => {
    expect(temaTop("ormon")).toBe(ormonTema);
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna"] as const) {
      expect(ormonTema[slot], slot).toBeTruthy();
    }
  });
});
```

`O/ormon-kontrast.test.ts` — fayl OXIRIGA qo'shing:

```ts
describe("the reward background (the result's ink-900 heading and ink-600 line, 4.5:1)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: both hold on the light, the edge, the hill and under the sunburst`, () => {
      const esc = mode.selector.replace(/\./g, "\\.");
      const block = css.match(new RegExp(`^${esc} \\{([\\s\\S]*?)^\\}`, "m"))?.[1] ?? "";
      const nur = block.match(/--ormon-mukofot-nur:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (!nur) throw new Error(`--ormon-mukofot-nur not found in ${mode.selector}`);
      const [r, g, b, a] = nur.slice(1).map(Number);
      const nurHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const ust = cssHexToken(css, mode.selector, "ormon-mukofot-ust");
      const grounds = [
        ust,
        cssHexToken(css, mode.selector, "ormon-mukofot-ost"),
        cssHexToken(css, mode.selector, "ormon-tepalik"),
        mixHex(nurHex, ust, a),
      ];
      for (const ground of grounds) {
        for (const token of ["ink-900", "ink-600"]) {
          expect(
            hexContrast(cssHexToken(css, mode.selector, token), ground),
            `${mode.name}: ${token} on ${ground}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/ormon/ormon-tema.test.ts src/components/student-portal/lernen/tema/ormon/ormon-kontrast.test.ts`
Expected: FAIL — `./ormon-mukofot-foni`, `./ormon-tema` topilmadi; kontrastda `--ormon-mukofot-nur not found in .lumio`.

- [ ] **Step 3: Add the reward tokens**

`client/src/app/globals.css` — `.lumio` bloki. Old:

```css
  --amber-ink: #9a5400;
```

New:

```css
  --amber-ink: #9a5400;

  /* «O'rmon» theme's reward background (ADR-0131): a pale mint in light
     mode, so the result's ink-900 and ink-600 text keep 4.5:1 on it, deep
     green in dark mode; ormon-kontrast.test.ts measures them. Plain custom
     properties, not Tailwind colour names. */
  --ormon-mukofot-ust: #f4fbf3;
  --ormon-mukofot-ost: #d9efe2;
  --ormon-tepalik: #c6e6d3;
  --ormon-mukofot-nur: rgba(255, 255, 255, 0.35);
```

`.dark .lumio` bloki. Old:

```css
  --amber-ink: #ffc24d;
```

New:

```css
  --amber-ink: #ffc24d;

  --ormon-mukofot-ust: #143c42;
  --ormon-mukofot-ost: #0f2a33;
  --ormon-tepalik: #12382f;
  --ormon-mukofot-nur: rgba(255, 241, 196, 0.03);
```

- [ ] **Step 4: Implement the reward background and assemble the theme**

`O/ormon-mukofot-foni.tsx`:

```tsx
import type { MukofotFoniProps } from "../tema-turlari";

/**
 * «O'rmon»: the reward stands in a forest clearing (ormon2.html `.rew`) — a
 * soft radial light, a hill at the bottom and, for a celebration, a slow
 * sunburst (`.ormon-burst`: rotation only, still under «Kam harakat»). The
 * colours are `.lumio` tokens — pale in light mode, deep in dark mode — so the
 * result's ink-900 heading and ink-600 line keep 4.5:1. The sound, the
 * confetti and Dafi are not the theme's.
 */
export function OrmonMukofotFoni({ bayram, children }: MukofotFoniProps) {
  return (
    <div
      data-mukofot="ormon"
      className="relative overflow-hidden rounded-[28px] px-4 py-6"
      style={{
        background: "radial-gradient(circle at 50% 30%, var(--ormon-mukofot-ust), var(--ormon-mukofot-ost) 75%)",
      }}
    >
      {bayram ? (
        <div
          aria-hidden
          className="ormon-burst pointer-events-none absolute size-[640px]"
          style={{
            left: "calc(50% - 320px)",
            top: "calc(30% - 320px)",
            background:
              "repeating-conic-gradient(from 0deg, var(--ormon-mukofot-nur) 0deg 10deg, transparent 10deg 30deg)",
            maskImage: "radial-gradient(closest-side, #000, transparent)",
            WebkitMaskImage: "radial-gradient(closest-side, #000, transparent)",
          }}
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "radial-gradient(ellipse at 50% 100%, var(--ormon-tepalik), transparent 70%)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
```

`O/ormon-tema.ts`:

```ts
import type { LernenTema } from "../tema-turlari";
import { OrmonJoy } from "./ormon-joy";
import { OrmonMukofotFoni } from "./ormon-mukofot-foni";
import { OrmonSahna } from "./ormon-sahna";
import { OrmonTugun } from "./ormon-tugun";
import { OrmonUnitLavha } from "./ormon-unit-lavha";

/** «O'rmon» (spec §8, ADR-0131): a soft layered forest in three biomes. */
export const ormonTema: LernenTema = {
  id: "ormon",
  TugunBelgisi: OrmonTugun,
  MukofotFoni: OrmonMukofotFoni,
  UnitLavha: OrmonUnitLavha,
  UnitJoyi: OrmonJoy,
  Sahna: OrmonSahna,
};
```

`L/tema/tema-reyestri.ts` — Old:

```ts
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
};
```

New:

```ts
import { ormonTema } from "./ormon/ormon-tema";
import { tozaTema } from "./toza/toza-tema";

/** Finished themes only; a look the student picked but that is not built draws the default. */
export const TEMALAR: Partial<Record<LernenTemaId, LernenTema>> = {
  toza: tozaTema,
  ormon: ormonTema,
};
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema src/app/globals-css.test.ts`
Expected: PASS (reyestr testi: «Toza»da sahna yo'q, `alp` hali «Toza»ga tushadi; `globals-css.test.ts` — `@theme` ga yangi nom qo'shilmagan).

- [ ] **Step 6: Commit**

```bash
git add client/src/app/globals.css client/src/components/student-portal/lernen/tema/ormon/ormon-mukofot-foni.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-tema.ts client/src/components/student-portal/lernen/tema/ormon/ormon-tema.test.ts client/src/components/student-portal/lernen/tema/ormon/ormon-kontrast.test.ts client/src/components/student-portal/lernen/tema/tema-reyestri.ts
git commit -m "feat(lernen): forest reward background and the O'rmon theme in the registry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — sahifalar sahnani chizadi (ramka, parda, ko'rinayotgan unit)

**Files:**
- Create: `L/tema/sahna-ramka.tsx`
- Test: `L/tema/sahna-ramka.test.ts`
- Modify: `L/yol/joriy-unit.ts` (+`L/yol/joriy-unit.test.ts`)
- Modify: `L/yol/lernen-yol.tsx`
- Modify: `L/lernen-levels-page.tsx`
- Test (yangi): `L/lernen-levels-page.test.ts`
- Modify: `L/lernen-unit-page.tsx` (Task 1 dagi ko'rinishiga nisbatan Edit'lar) (+`L/lernen-unit-page.test.ts` — qo'shiladi)

**Interfaces:**
- Consumes: `CONTENT_INSET`, `RAIL_WIDTH`, `type SidebarMode`, `useSidebar` (`client/src/components/student-portal/lib/sidebar-store.ts`); `LernenTema.Sahna`, `UnitJoyi` (Task 1); `temaTop("ormon")` (Task 8); `useJoriyUnit` (mavjud).
- Produces:
  - `SahnaRamka({ sidebarMode, children }: { sidebarMode: SidebarMode; children: React.ReactNode })`
  - `SAHNA_PARDASI = "rounded-2xl bg-surface px-3 py-2 shadow-lumio-sm"` (sarlavha bloki), `SAHNA_PARDASI_KICHIK = "w-fit rounded-full bg-surface px-2.5 py-0.5 shadow-lumio-sm"` (bir qatorli yorliq), `SAHNA_KARTASI = "rounded-[28px] bg-surface shadow-lumio-card"` (o'z paddingi bor blok: bo'sh/xato holat)
  - `joriyUnitTartibi(levels: readonly { units: readonly { id: number; order: number }[] }[] | undefined, unitId: number | null): number`
  - `LernenYolProps.onUnitKorindi?: (unitId: number) => void`
  - Sahifalar: tema `Sahna` bersa — ildiz `isolate`, `SahnaRamka` + `Sahna` yuklash holatidan oldin, umumiy matn pardada; bermasa — markup avvalgidek.

- [ ] **Step 1: Write the failing tests**

`L/tema/sahna-ramka.test.ts`:

```ts
import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RAIL_WIDTH, type SidebarMode } from "../../lib/sidebar-store";
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./sahna-ramka";

/** `{ md: 72, lg: 240 }` from a fragment such as "md:w-[72px] lg:w-[240px]". */
function pxByBreakpoint(classes: string, utility: "w" | "pl"): Record<string, number> {
  const found: Record<string, number> = {};
  for (const [, breakpoint, px] of classes.matchAll(new RegExp(`(?:^|\\s)(\\w+):${utility}-\\[(\\d+)px\\]`, "g"))) {
    found[breakpoint] = Number(px);
  }
  return found;
}

// `children` is the third argument (react/no-children-prop).
const ramka = (sidebarMode: SidebarMode) =>
  renderToStaticMarkup(createElement(SahnaRamka, { sidebarMode } as ComponentProps<typeof SahnaRamka>, "sahna"));
const rootClasses = (html: string) => html.match(/^<div[^>]*\sclass="([^"]*)"/)?.[1] ?? "";

// The frame is `fixed`, so nothing in the page flow keeps it clear of the side
// rail; the rail is glass, and a scene under it would show through.
describe("SahnaRamka", () => {
  it.each(["auto", "collapsed", "expanded"] as const)("starts where the %s rail ends, at every breakpoint", (mode) => {
    const rail = pxByBreakpoint(RAIL_WIDTH[mode], "w");
    expect(Object.keys(rail).length).toBeGreaterThan(0);
    expect(pxByBreakpoint(rootClasses(ramka(mode)), "pl")).toEqual(rail);
  });

  it("covers the screen behind the content and never takes a tap or a screen reader", () => {
    const html = ramka("auto");
    const classes = rootClasses(html).split(/\s+/);
    for (const c of ["fixed", "inset-0", "-z-10", "pointer-events-none"]) expect(classes).toContain(c);
    expect(html).toMatch(/^<div aria-hidden="true"/);
    expect(html).toContain("sahna");
  });
});

describe("the plates for text on a scene", () => {
  it("are the plain, opaque surface with no backdrop blur", () => {
    for (const plate of [SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SAHNA_KARTASI]) {
      expect(plate.split(" ")).toContain("bg-surface");
      expect(plate).not.toContain("backdrop-");
    }
  });
});
```

`L/yol/joriy-unit.test.ts` — import qatorini almashtiring va fayl OXIRIGA qo'shing.

Old:

```ts
import { joriyUnitIndeksi } from "./joriy-unit";
```

New:

```ts
import { joriyUnitIndeksi, joriyUnitTartibi } from "./joriy-unit";
```

Fayl oxiriga:

```ts
describe("joriyUnitTartibi", () => {
  const levels = [
    { units: [{ id: 7, order: 1 }, { id: 9, order: 2 }] },
    { units: [{ id: 31, order: 1 }] },
  ];

  it("is the order in its level of the unit the path reports", () => {
    expect(joriyUnitTartibi(levels, 9)).toBe(2);
    expect(joriyUnitTartibi(levels, 31)).toBe(1);
  });

  it("is 1 while the path has not loaded, no unit is reported or the id is unknown", () => {
    expect(joriyUnitTartibi(undefined, 9)).toBe(1);
    expect(joriyUnitTartibi(levels, null)).toBe(1);
    expect(joriyUnitTartibi(levels, 404)).toBe(1);
  });
});
```

`L/lernen-levels-page.test.ts` (yangi):

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { LernenLevelsPage } from "./lernen-levels-page";
import { SAHNA_PARDASI } from "./tema/sahna-ramka";
import type { LernenLevel, LernenSeans } from "./types";

const seans = (id: number, completedAt: string | null): LernenSeans => ({
  id,
  order: id,
  kind: "SECTION_A",
  titleDe: "Begrüßung",
  titleUz: null,
  wordCount: 0,
  exerciseCount: 0,
  completedAt,
  bestScore: 0,
  runs: 0,
});

const LEVELS: LernenLevel[] = [
  {
    level: "A1",
    label: "A1",
    units: [
      {
        id: 7,
        order: 2,
        titleUz: "Sonlar",
        titleDe: "Zahlen",
        lessonCount: 2,
        doneCount: 1,
        bereit: true,
        finalTest: null,
        sections: [
          {
            id: 70,
            order: 1,
            code: "u02-s1",
            titleUz: "Sonlar",
            titleDe: "Zahlen",
            lessons: [seans(1, "2026-10-04T10:00:00Z"), seans(2, null)],
          },
        ],
      },
    ],
  },
];

/** The first paint: the profile (the look) and the path as given; nothing else has answered. */
function render({ tema, levels }: { tema?: string; levels?: LernenLevel[] }): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  if (tema) client.setQueryData(["student-portal", "profile"], { lernenTema: tema });
  if (levels) client.setQueryData(["lernen", "levels"], levels);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(LernenLevelsPage)));
}

describe("the path page in the «O'rmon» look (ADR-0131)", () => {
  it("stands the forest while the path is still loading: no gaps (spec §10)", () => {
    const h = render({ tema: "ormon" });
    expect(h).toContain('data-sahna="ormon"');
    expect(h).toMatch(/data-biom="tong" data-faol=""/);
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  it("draws the forest nodes and puts the heading and the level divider on plates", () => {
    const h = render({ tema: "ormon", levels: LEVELS });
    expect(h).toContain('data-tugun="ormon"');
    expect(h).toContain(SAHNA_PARDASI);
    expect(h).toMatch(/w-fit rounded-full bg-surface px-2\.5 py-0\.5 shadow-lumio-sm">A1</);
  });
});

describe("the path page in the «Toza» look", () => {
  it("draws no scene and no plates", () => {
    const h = render({ levels: LEVELS });
    expect(h).not.toContain("data-sahna");
    expect(h).not.toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/^<div[^>]*\bisolate\b/);
  });
});
```

`L/lernen-unit-page.test.ts` — importlarga qo'shing (mavjud `import type { LernenSeans, LernenUnit } from "./types";` dan keyin):

```ts
import { SAHNA_PARDASI } from "./tema/sahna-ramka";
```

Fayl OXIRIGA:

```ts
// ADR-0131: «O'rmon» stands the unit's forest behind the page and draws the
// lessons as places in it; «Toza» stays exactly as it was.
async function ormonHtml(): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => unit });
  client.setQueryData(["student-portal", "profile"], { lernenTema: "ormon" });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(LernenUnitPage, { unitId: 7 })),
  );
}

describe("the unit page in the «O'rmon» look (ADR-0131)", () => {
  it("stands the unit's forest in a frame behind the content (unit 4: the dawn again)", async () => {
    const h = await ormonHtml();
    expect(h).toContain('data-sahna="ormon"');
    expect(h).toMatch(/data-biom="tong" data-faol=""/);
    expect(h).toContain("pointer-events-none fixed inset-0 -z-10");
    expect(h).toMatch(/^<div[^>]*class="[^"]*\bisolate\b/);
  });

  it("draws each lesson as its place and the header in the unit's biome", async () => {
    const h = await ormonHtml();
    expect(h).toContain('data-joy="kulba"');
    expect(h).toContain('data-joy="koprik"');
    expect(h).toContain('data-joy="gor"');
    expect(h).toContain('data-lavha-biom="tong"');
  });

  it("gives the same lock answers: «Boshlash» once, two closed places", async () => {
    const h = await ormonHtml();
    expect(h.replace(/<[^>]*>/g, " ").match(/Boshlash/g)).toHaveLength(1);
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(h).toContain("Tanishuv — hali ochilmagan");
  });

  it("puts the page's own text on plates and uses no unreadable ink", async () => {
    const h = await ormonHtml();
    expect(h).toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/\btext-(?:ink-500|ink-400|success|coral-600)\b/);
  });
});

describe("the unit page in the «Toza» look", () => {
  it("draws no scene and no plates", async () => {
    const h = await html();
    expect(h).not.toContain("data-sahna");
    expect(h).not.toContain(SAHNA_PARDASI);
    expect(h).not.toMatch(/^<div[^>]*\bisolate\b/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema/sahna-ramka.test.ts src/components/student-portal/lernen/yol/joriy-unit.test.ts src/components/student-portal/lernen/lernen-levels-page.test.ts src/components/student-portal/lernen/lernen-unit-page.test.ts`
Expected: FAIL — `./sahna-ramka` topilmadi; `joriyUnitTartibi is not a function`; O'rmon testlarida `data-sahna="ormon"` yo'q.

- [ ] **Step 3: Implement the frame and the plates**

`L/tema/sahna-ramka.tsx`:

```tsx
"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";
import { CONTENT_INSET, type SidebarMode } from "../../lib/sidebar-store";

/**
 * Text a page draws straight on a scene sits on the plain surface — exactly as
 * on «Toza»'s cards — so it reads at 4.5:1 over any part of the picture
 * (spec §11). Only when the theme has a scene; no backdrop blur (the scene
 * moves under it on every scroll frame).
 */
export const SAHNA_PARDASI = "rounded-2xl bg-surface px-3 py-2 shadow-lumio-sm";

/** The same for a one-line caption (a level divider, a node's section name). */
export const SAHNA_PARDASI_KICHIK = "w-fit rounded-full bg-surface px-2.5 py-0.5 shadow-lumio-sm";

/** The same for a block with its own padding (an empty or a failed state). */
export const SAHNA_KARTASI = "rounded-[28px] bg-surface shadow-lumio-card";

/**
 * The frame every theme's scene is drawn in (ADR-0131): the whole screen,
 * behind the page's content (the page root is `isolate`, the frame `-z-10`),
 * clear of the side rail — it is `fixed`, so the content column's inset does
 * not reach it — and never in the way of a tap or a screen reader. The rail
 * mode is a prop (as `PastkiPanel`'s), so a test can render every width.
 */
export function SahnaRamka({ sidebarMode, children }: { sidebarMode: SidebarMode; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 -z-10", CONTENT_INSET[sidebarMode])}>
      <div className="relative h-full w-full overflow-hidden">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Find the visible unit's order**

`L/yol/joriy-unit.ts` — Old:

```ts
  return idx;
}

/** Sticky banner follows the scroll. One passive listener, work done inside a frame. */
```

New:

```ts
  return idx;
}

/**
 * The order (1-based, in its level) of the unit with this id, for the page's
 * scene; 1 while the path or the unit is not known yet.
 */
export function joriyUnitTartibi(
  levels: readonly { units: readonly { id: number; order: number }[] }[] | undefined,
  unitId: number | null,
): number {
  if (!levels || unitId == null) return 1;
  for (const level of levels) {
    for (const unit of level.units) if (unit.id === unitId) return unit.order;
  }
  return 1;
}

/** Sticky banner follows the scroll. One passive listener, work done inside a frame. */
```

- [ ] **Step 5: The path tells its unit and plates two captions**

`L/yol/lernen-yol.tsx` — Edit'lar ketma-ket:

Old:

```ts
import type { LernenTema } from "../tema/tema-turlari";
```

New:

```ts
import { SAHNA_PARDASI_KICHIK } from "../tema/sahna-ramka";
import type { LernenTema } from "../tema/tema-turlari";
```

Old:

```ts
export interface LernenYolProps {
  levels: LernenLevel[];
}
```

New:

```ts
export interface LernenYolProps {
  levels: LernenLevel[];
  /** Told the id of the unit the student is scrolling through; the page's scene follows it (ADR-0131). */
  onUnitKorindi?: (unitId: number) => void;
}
```

Old:

```tsx
function DarajaYorligi({ matn }: { matn: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-500">
```

New:

```tsx
function DarajaYorligi({ matn, sahnali }: { matn: string; sahnali: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span
        className={cn(
          "font-display text-sm font-extrabold uppercase tracking-wide text-ink-500",
          // On a theme's scene the caption sits on the plain surface (ADR-0131).
          sahnali && SAHNA_PARDASI_KICHIK,
        )}
      >
```

Old:

```tsx
  ostyozuvKorinsinmi,
  Belgi,
  onClick,
  onQulf,
  ref,
}: {
  tugun: YolTugun;
  align: (typeof TEKISLASH)[number];
  ostyozuvKorinsinmi: boolean;
```

New:

```tsx
  ostyozuvKorinsinmi,
  sahnali,
  Belgi,
  onClick,
  onQulf,
  ref,
}: {
  tugun: YolTugun;
  align: (typeof TEKISLASH)[number];
  ostyozuvKorinsinmi: boolean;
  /** The theme draws a scene: the section name above the node sits on the plain surface (ADR-0131). */
  sahnali: boolean;
```

Old:

```tsx
          <p className="max-w-[132px] truncate text-center text-[11px] font-bold uppercase tracking-wide text-ink-400">
```

New:

```tsx
          <p
            className={cn(
              "max-w-[132px] truncate text-center text-[11px] font-bold uppercase tracking-wide text-ink-400",
              sahnali && SAHNA_PARDASI_KICHIK,
            )}
          >
```

Old:

```tsx
export function LernenYol({ levels }: LernenYolProps) {
```

New:

```tsx
export function LernenYol({ levels, onUnitKorindi }: LernenYolProps) {
```

Old:

```tsx
  const { tema } = useLernenTema();
  const kam = useKamHarakat();
```

New:

```tsx
  const { tema } = useLernenTema();
  const sahnali = tema.Sahna != null;
  const kam = useKamHarakat();
```

Old:

```tsx
  const korinayotganUnit = unitlar[Math.min(joriyUnit, unitlar.length - 1)];
```

New:

```tsx
  const korinayotganUnit = unitlar[Math.min(joriyUnit, unitlar.length - 1)];
  // The page's scene follows the unit on screen (its biome, ADR-0131).
  const korinayotganUnitId = korinayotganUnit?.id ?? null;
  React.useEffect(() => {
    if (korinayotganUnitId != null) onUnitKorindi?.(korinayotganUnitId);
  }, [korinayotganUnitId, onUnitKorindi]);
```

Old:

```tsx
            return <DarajaYorligi key={`daraja-${i}-${tugun.daraja}`} matn={tugun.matn} />;
```

New:

```tsx
            return <DarajaYorligi key={`daraja-${i}-${tugun.daraja}`} matn={tugun.matn} sahnali={sahnali} />;
```

Old:

```tsx
              ostyozuvKorinsinmi={meta.ostyozuvKorinsinmi}
              Belgi={tema.TugunBelgisi}
```

New:

```tsx
              ostyozuvKorinsinmi={meta.ostyozuvKorinsinmi}
              sahnali={sahnali}
              Belgi={tema.TugunBelgisi}
```

- [ ] **Step 6: The path page stands the scene**

`L/lernen-levels-page.tsx` — Edit'lar:

Old:

```ts
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/use-t";
import { useLernenLevels } from "./queries";
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
import { LernenYol } from "./yol/lernen-yol";
```

New:

```ts
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/use-t";
import { useLernenLevels } from "./queries";
import { loadState } from "../lib/load-state";
import { useSidebar } from "../lib/sidebar-store";
import { LoadFailed } from "../load-failed";
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./tema/sahna-ramka";
import { useLernenTema } from "./tema/use-lernen-tema";
import { joriyUnitTartibi } from "./yol/joriy-unit";
import { LernenYol } from "./yol/lernen-yol";
```

Old:

```tsx
  const yolBosh = data != null && data.length === 0;

  return (
    <Screen>
      {/* Sarlavha tab nomi bilan bir xil. «Darslar» Asosiy sahifada markazdagi
          guruh darslarini anglatadi — bu yerda ishlatilsa, ikki joy bitta nom
          bilan chalkashadi. */}
      <ScreenHeader subtitle={t("Nemis tili")} title={t("Ta'lim")} />
```

New:

```tsx
  const yolBosh = data != null && data.length === 0;
  const { tema } = useLernenTema();
  const Sahna = tema.Sahna;
  const sidebarMode = useSidebar((s) => s.mode);
  // The unit the student is scrolling through, told by the path: the scene follows it.
  const [korinayotganUnitId, setKorinayotganUnitId] = React.useState<number | null>(null);

  return (
    // `isolate` (only with a scene): the frame (-z-10) stays behind the page and above the shell's background.
    <Screen className={cn(Sahna && "isolate")}>
      {/* Independent of the path's request (spec §10): the scene stands while it loads or fails too. */}
      {Sahna ? (
        <SahnaRamka sidebarMode={sidebarMode}>
          <Sahna unitTartibi={joriyUnitTartibi(data, korinayotganUnitId)} />
        </SahnaRamka>
      ) : null}

      {/* Sarlavha tab nomi bilan bir xil. «Darslar» Asosiy sahifada markazdagi
          guruh darslarini anglatadi — bu yerda ishlatilsa, ikki joy bitta nom
          bilan chalkashadi. */}
      <ScreenHeader
        subtitle={t("Nemis tili")}
        title={t("Ta'lim")}
        className={cn(Sahna && SAHNA_PARDASI)}
      />
```

Old:

```tsx
        <LoadFailed query={query} />
      ) : yolBosh ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
          title={t("O'quv yo'li hali tayyor emas")}
          description={t("Material tez orada qo'shiladi.")}
        />
      ) : (
        <FadeIn className="space-y-4">
          <LernenYol levels={data} />

          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
```

New:

```tsx
        <LoadFailed query={query} className={cn(Sahna && SAHNA_KARTASI)} />
      ) : yolBosh ? (
        <EmptyState
          className={cn(Sahna && SAHNA_KARTASI)}
          icon={<BookOpen size={28} weight="bold" />}
          title={t("O'quv yo'li hali tayyor emas")}
          description={t("Material tez orada qo'shiladi.")}
        />
      ) : (
        <FadeIn className="space-y-4">
          <LernenYol levels={data} onUnitKorindi={setKorinayotganUnitId} />

          <section className="space-y-3">
            <h2
              className={cn(
                "font-display text-sm font-bold uppercase tracking-wide text-ink-500",
                Sahna && SAHNA_PARDASI_KICHIK,
              )}
            >
```

- [ ] **Step 7: The unit page stands the scene**

`L/lernen-unit-page.tsx` (Task 1 ko'rinishi) — Edit'lar:

Old:

```ts
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
```

New:

```ts
import { loadState } from "../lib/load-state";
import { useSidebar } from "../lib/sidebar-store";
import { LoadFailed } from "../load-failed";
```

Old:

```ts
import { useLernenTema } from "./tema/use-lernen-tema";
```

New:

```ts
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./tema/sahna-ramka";
import { useLernenTema } from "./tema/use-lernen-tema";
```

Old:

```tsx
function SozlarQatori({ hisob }: { hisob: SozHisoblagichi }) {
  return (
    <div className="space-y-1 px-1">
```

New:

```tsx
function SozlarQatori({ hisob, className }: { hisob: SozHisoblagichi; className?: string }) {
  return (
    <div className={cn("space-y-1 px-1", className)}>
```

Old:

```tsx
  const { tema } = useLernenTema();
```

New:

```tsx
  const { tema } = useLernenTema();
  const Sahna = tema.Sahna;
  const sidebarMode = useSidebar((s) => s.mode);
```

Old:

```tsx
    // The marker sits on this outer root; the stagger below is strictly inside it (descendant selector).
    <Screen narrow data-kam-harakat={kam ? "" : undefined}>
      <StackHeader title={data?.titleUz ?? t("Bo'lim")} backHref="/portal/lernen" />
```

New:

```tsx
    // The marker sits on this outer root; the stagger below is strictly inside it (descendant selector).
    // `isolate` (only with a scene): the frame (-z-10) stays behind the page and above the shell's background.
    <Screen narrow data-kam-harakat={kam ? "" : undefined} className={cn(Sahna && "isolate")}>
      {/* Independent of the unit's request (spec §10): the scene stands while it loads or fails too. */}
      {Sahna ? (
        <SahnaRamka sidebarMode={sidebarMode}>
          <Sahna unitTartibi={data?.order ?? 1} />
        </SahnaRamka>
      ) : null}
      <StackHeader
        title={data?.titleUz ?? t("Bo'lim")}
        backHref="/portal/lernen"
        className={cn(Sahna && SAHNA_PARDASI)}
      />
```

Old:

```tsx
        <LoadFailed query={query} />
      ) : boshMi ? (
        <EmptyState
          icon={<BookOpen size={28} weight="bold" />}
```

New:

```tsx
        <LoadFailed query={query} className={cn(Sahna && SAHNA_KARTASI)} />
      ) : boshMi ? (
        <EmptyState
          className={cn(Sahna && SAHNA_KARTASI)}
          icon={<BookOpen size={28} weight="bold" />}
```

Old:

```tsx
                <div className="px-1">
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-600">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} /> : null}
```

New:

```tsx
                <div className={cn("px-1", Sahna && SAHNA_PARDASI)}>
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-600">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} className={cn(Sahna && SAHNA_PARDASI)} /> : null}
```

Old:

```tsx
              <h2 className="px-1 font-display text-base font-extrabold text-ink-900">
                {t("Yakuniy sinov")}
              </h2>
```

New:

```tsx
              <h2
                className={cn(
                  "px-1 font-display text-base font-extrabold text-ink-900",
                  Sahna && SAHNA_PARDASI_KICHIK,
                )}
              >
                {t("Yakuniy sinov")}
              </h2>
```

- [ ] **Step 8: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen src/components/student-portal/student-portal-load-states.test.ts src/components/student-portal/student-portal-nav.test.ts`
Expected: PASS — yangi O'rmon testlari yashil; «Toza» testlari (`lernen-unit-page.test.ts` ning mavjud 10 tasi, `student-portal-load-states.test.ts`) o'zgarmasdan yashil.

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/sahna-ramka.tsx client/src/components/student-portal/lernen/tema/sahna-ramka.test.ts client/src/components/student-portal/lernen/yol/joriy-unit.ts client/src/components/student-portal/lernen/yol/joriy-unit.test.ts client/src/components/student-portal/lernen/yol/lernen-yol.tsx client/src/components/student-portal/lernen/lernen-levels-page.tsx client/src/components/student-portal/lernen/lernen-levels-page.test.ts client/src/components/student-portal/lernen/lernen-unit-page.tsx client/src/components/student-portal/lernen/lernen-unit-page.test.ts
git commit -m "feat(lernen): the path and the unit page stand the theme's scene

SahnaRamka (fixed, behind the content, clear of the rail) stands while the data
loads; the path tells the page the unit on screen; shared text sits on plain
surface plates only when the theme has a scene. Toza is unchanged.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Client — Sozlamalarda «O'rmon» (miniatyura, `tayyor`), ADR-0131 va hujjatlar

**Files:**
- Create: `O/ormon-miniatyura.tsx`
- Modify: `O/ormon-tema.ts`, `O/ormon-tema.test.ts`
- Modify: `client/src/lib/lernen-temalar.ts` (+`client/src/lib/lernen-temalar.test.ts`)
- Modify: `client/src/components/student-portal/lernen-korinish-tanlash.tsx` (+`lernen-korinish-tanlash.test.ts`)
- Create: `docs/adr/0131-lernen-ormon-tema-sahna-va-joy-orinlari.md`
- Modify: `docs/adr/README.md`, `client/CLAUDE.md`

**Interfaces:**
- Consumes: `TEMALAR` (`L/tema/tema-reyestri.ts`), `LernenTema.Miniatyura?: React.ComponentType` (Task 1), `BIOMES` (Task 2), `ormonTema` (Task 8); `TAYYOR_TEMALAR` (`client/src/lib/lernen-temalar.ts`).
- Produces: `OrmonMiniatyura()` — `<svg data-miniatyura="ormon">`; `TAYYOR_TEMALAR` → `["toza", "ormon"]`; Sozlamalar → «Ta'lim ko'rinishi» da O'rmon kartasi.

- [ ] **Step 1: Write the failing tests**

`client/src/lib/lernen-temalar.test.ts` — Old:

```ts
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza"]);
```

New:

```ts
    expect(TAYYOR_TEMALAR.map((t) => t.id)).toEqual(["toza", "ormon"]);
```

`client/src/components/student-portal/lernen-korinish-tanlash.test.ts` — Old:

```ts
    expect(radios(html)).toHaveLength(TAYYOR_TEMALAR.length);
    // Unfinished looks are not offered.
    expect(html).not.toContain("O&#x27;rmon");
  });
```

New:

```ts
    expect(radios(html)).toHaveLength(TAYYOR_TEMALAR.length);
    // Unfinished looks are not offered.
    expect(html).not.toContain("Dengiz");
    expect(html).not.toContain("Nemis sayohati");
  });

  it("offers «O'rmon» with its still miniature; «Toza» keeps its colour dot (spec §7)", () => {
    const [toza, ormon] = radios(render());
    expect(ormon[1]).toContain("O&#x27;rmon");
    expect(ormon[1]).toContain("Yumshoq qatlamli o&#x27;rmon");
    expect(ormon[1]).toContain('data-miniatyura="ormon"');
    expect(ormon[0]).toContain('aria-checked="false"');
    expect(toza[1]).toContain("background:#ff6b4a");
    expect(toza[1]).not.toContain("data-miniatyura");
  });
```

`O/ormon-tema.test.ts` — Old:

```ts
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna"] as const) {
```

New:

```ts
    for (const slot of ["TugunBelgisi", "MukofotFoni", "UnitLavha", "UnitJoyi", "Sahna", "Miniatyura"] as const) {
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts src/components/student-portal/lernen-korinish-tanlash.test.ts src/components/student-portal/lernen/tema/ormon/ormon-tema.test.ts`
Expected: FAIL — `TAYYOR_TEMALAR` faqat `["toza"]`; `radios` da ikkinchi karta yo'q (`ormon` undefined); `Miniatyura: expected undefined to be truthy`.

- [ ] **Step 3: Implement the miniature and offer the look**

`O/ormon-miniatyura.tsx`:

```tsx
import { BIOMES } from "./ormon-biom";

/** «O'rmon»'s picture on its card in Sozlamalar (spec §7): a still, tiny forest at dawn with a lit node. */
export function OrmonMiniatyura() {
  const p = BIOMES.tong;
  return (
    <svg data-miniatyura="ormon" viewBox="0 0 56 40" className="h-10 w-14" aria-hidden="true">
      <defs>
        <linearGradient id="ormon-miniatyura-osmon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky1} />
          <stop offset="1" stopColor={p.sky2} />
        </linearGradient>
      </defs>
      <rect width="56" height="40" rx="10" fill="url(#ormon-miniatyura-osmon)" />
      <circle cx="12" cy="20" r="9" fill={p.far} opacity="0.7" />
      <circle cx="44" cy="18" r="10" fill={p.far} opacity="0.7" />
      <circle cx="8" cy="35" r="10" fill={p.near} />
      <circle cx="50" cy="36" r="9" fill={p.near} />
      <circle cx="28" cy="26" r="9" fill="#a6fde8" opacity="0.35" />
      <circle cx="28" cy="26" r="6" fill="#86ead2" />
    </svg>
  );
}
```

`O/ormon-tema.ts` — Old:

```ts
import { OrmonJoy } from "./ormon-joy";
```

New:

```ts
import { OrmonJoy } from "./ormon-joy";
import { OrmonMiniatyura } from "./ormon-miniatyura";
```

Old:

```ts
  Sahna: OrmonSahna,
};
```

New:

```ts
  Sahna: OrmonSahna,
  Miniatyura: OrmonMiniatyura,
};
```

`client/src/lib/lernen-temalar.ts` — Old:

```ts
  { id: "ormon", label: msg("O'rmon"), hint: msg("Yumshoq qatlamli o'rmon"), swatch: "#2f6b4f", tayyor: false },
```

New:

```ts
  { id: "ormon", label: msg("O'rmon"), hint: msg("Yumshoq qatlamli o'rmon"), swatch: "#2f6b4f", tayyor: true },
```

`client/src/components/student-portal/lernen-korinish-tanlash.tsx` — Edit'lar:

Old:

```ts
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
```

New:

```ts
import { TEMALAR } from "./lernen/tema/tema-reyestri";
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
```

Old:

```tsx
            const tanlangan = tema.id === id;
```

New:

```tsx
            const tanlangan = tema.id === id;
            // The theme's own still picture (spec §7); a theme without one keeps the colour dot.
            const Miniatyura = TEMALAR[tema.id]?.Miniatyura;
```

Old:

```tsx
                <span aria-hidden className="size-8 shrink-0 rounded-full" style={{ background: tema.swatch }} />
```

New:

```tsx
                <span aria-hidden className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-xl">
                  {Miniatyura ? (
                    <Miniatyura />
                  ) : (
                    <span className="size-8 rounded-full" style={{ background: tema.swatch }} />
                  )}
                </span>
```

- [ ] **Step 4: Verify the server needs nothing**

Run: `grep -n "LERNEN_TEMA_IDLARI = " server/src/common/lernen-temalar.ts`
Expected: `export const LERNEN_TEMA_IDLARI = ['toza', 'ormon', 'dengiz', 'alp'] as const;` — `ormon` bor, server o'zgarmaydi (`PATCH /student-portal/lernen-tema` uni allaqachon qabul qiladi).

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/lib/lernen-temalar.test.ts src/components/student-portal/lernen-korinish-tanlash.test.ts src/components/student-portal/lernen/tema src/i18n`
Expected: PASS (klient↔server nusxa testi yashil; `"O'rmon"` va `"Yumshoq qatlamli o'rmon"` lug'atlarda bor — yangi kalit yo'q).

- [ ] **Step 6: Write ADR-0131**

Avval raqamni tekshiring: `ls docs/adr | tail -3` va `grep -n "^| \[013" docs/adr/README.md`. Eng oxirgisi 0130 bo'lsa — 0131; `main` da yangisi paydo bo'lgan bo'lsa, keyingi bo'sh raqamni oling va fayl nomi, sarlavha va README qatorini shunga moslang.

`docs/adr/0131-lernen-ormon-tema-sahna-va-joy-orinlari.md`:

```markdown
# ADR-0131 — Ta'lim «O'rmon» temasi: shartnomaga sahna va joy o'rinlari, sahna unumdorligi qoidalari

**Holati:** Qabul qilindi
**Sana:** 2026-10-26
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§5, §7, §8, §9, §11, §12), `docs/superpowers/plans/2026-10-26-lernen-ormon-tema.md`, ADR-0125, ADR-0128

## Kontekst

Ta'lim dizaynining 3-bosqichi — «O'rmon» temasi (CEO tasdiqlagan mockup `docs/superpowers/mockups/2026-10-24-lernen-dizayn/ormon2.html`): yo'l va unit sahifasi orqasida uch biomli (tong, ko'l, kuz) qatlamli o'rmon, uchqunlar, nur dastasi, parallaks; unit sahifasida darslar sahnadagi «joy» (kulba, ko'prik, g'or, qal'a), qulflilari tumanda. 1–2-bosqich shartnomasida (`TugunBelgisi`, `MukofotFoni`, `UnitLavha`) sahna o'rni yo'q edi; unit sahifasidagi joy kartalari «Toza» modelidan to'g'ridan-to'g'ri chizilardi (ADR-0128, Oqibatlar). Doimiy fon animatsiyasi zaif telefonda og'ir bo'lishi mumkin (spec §14).

## Qaror

1. **Shartnoma:** `LernenTema` ga `UnitJoyi` (majburiy; «Toza»niki — eski karta so'zma-so'z ko'chirildi), `Sahna?` va `Miniatyura?` (ixtiyoriy) qo'shildi; `UnitLavhaProps` ga `unitTartibi?`. Sahnasiz tema («Toza») o'zgarmaydi. Yo'l mantig'i (`yol-tuzilishi`, `fortschritt`, `seans-navbat`) tegilmadi; `LernenYol` faqat ko'rinayotgan unitni sahifaga aytadi (`onUnitKorindi`).
2. **Sahnani sahifa chizadi:** `SahnaRamka` (`tema/sahna-ramka.tsx`) — `fixed`, `-z-10` (sahifa ildizi `isolate`), `CONTENT_INSET` bilan rail'dan chiqadi, `aria-hidden`, bosishni olmaydi. U yuklash holatidan oldin chiziladi: ma'lumot kelmasa yoki yiqilsa ham fon turadi.
3. **Biom unitning darajadagi tartibidan:** `biomeForUnit(order)` — tong, ko'l, kuz, yana tong (spec §5 dagi `palitraUnitga`). Yo'l ham, unit sahifasi ham `order` ni biladi — qo'shimcha so'rov yo'q, ikki ekran bir biomni ko'rsatadi.
4. **Unumdorlik qoidalari** (keyingi temalar uchun ham majburiy): faqat `transform` va `opacity` animatsiya qilinadi (`globals-css.test.ts`); sahna boshiga bitta `requestAnimationFrame` (parallaks), yashirin tabda va ekrandan tashqarida to'xtaydi (`data-tinch`); qatlam — aylanuvchi 640 px SVG plitka, DOM yo'l uzunligiga bog'liq emas; xiralik SVG ichida, harakatlanuvchi qatlamda CSS `filter` yo'q, sahna ustida `backdrop-filter` yo'q; biom almashinuvi — `opacity` almashuvi, ko'rinmayotgan biom chizilmaydi (`visibility: hidden`); sahnada ≤ 1500 element (amalda ~400); zaif qurilmada (`hardwareConcurrency <= 4` yoki `deviceMemory <= 2`; brauzer javob bermaguncha shunday deb olinadi) qatlam va bezak yarmi; «Kam harakat» (tizim yoki qurilma) — qotgan rasm.
5. **Kontrast:** sahifaning umumiy matni (sarlavha, daraja yorlig'i, bo'lim sarlavhasi, bo'sh/xato holat) sahnada shaffof bo'lmagan `bg-surface` parda ustida turadi — faqat sahnali temada. Temaning o'z matni (tugun yorlig'i, joy kartasi, lavha, «Boshlash», mukofot foni) 4.5:1 dan past emas: `ormon-kontrast.test.ts` uni `globals.css` tokenlari va biom ranglaridan, yorug' va qorong'u rejimda hisoblaydi.
6. **Tanlash:** `ormon` — `tayyor: true`; Sozlamalardagi karta temaning statik `Miniatyura` sini chizadi. Server ro'yxati o'zgarmadi (`ormon` id'si allaqachon bor).

## Rad etilgan yo'llar

- **Rangni skroll bilan uzluksiz aralashtirish** (mockupdagi `palAt`, har kadrda CSS o'zgaruvchilari): har kadrda katta xira qatlamlarni qayta chizadi.
- **Yo'l balandligiga teng qatlamlar** (mockupdagi `lh`): DOM va GPU xotirasi yo'l bilan o'sadi, ma'lumot kelmaguncha balandlik noma'lum.
- **«Shisha» kartalar (`backdrop-filter`) va qatlamlarda CSS `blur`:** sahna har skroll kadrida ostidan siljiydi — zaif telefonda har kadr qayta xiralash.
- **Sahnani har tema o'zi `fixed` qilishi:** rail, qatlam tartibi va «yuklanayotganda ham» qoidalari har temada takrorlanardi.
- **Biomni yo'ldagi unitning umumiy indeksidan:** unit sahifasi uchun butun yo'l so'rovi kerak bo'lardi.
- **Daraxtlar tebranishi va tugunlarni bog'lovchi yorug' lenta:** birinchisi SVG ichida qayta chizadi, ikkinchisi tugun koordinatalarini DOM'dan o'lchashni talab qiladi.

## Oqibatlar

- Yangi tema (Dengiz, Nemis sayohati) o'z `Sahna` sini beradi, sahifa uni `SahnaRamka` ichida chizadi; 4-banddagi qoidalar unga ham tegishli. `layerOffset`, `scenePaused` (`harakat/parallaks.ts`) va `useParallaks`, `useSahnaPauza`, `useYengilRejim` (`harakat/use-sahna.ts`) qayta ishlatiladi.
- O'rmonning tokenlari (`--ormon-*`) `.lumio` va `.dark .lumio` ichida; animatsiyalar `.ormon-*` sinflari, `data-kam-harakat`, `data-tinch` va `prefers-reduced-motion` ostida to'xtaydi.
- Ataylab qoldirildi (4–5-bosqich yoki kerak bo'lganda): yo'ldagi unit qatori va daraja yorlig'ining tema ko'rinishi (shartnomada o'rni yo'q), tugunlarni bog'lovchi lenta, temalar kodini alohida chunk'ka bo'lish.
- Ma'lum cheklov: juda baland ekranda (> 1280 px) qatlamlar uch plitkadan keyin tugaydi — ostida osmon gradienti turadi (bo'shliq emas).
```

- [ ] **Step 7: Add the ADR to the index**

`docs/adr/README.md` — jadvalning oxirgi qatoridan (hozir 0130) keyin. Old:

```markdown
| [0130](0130-soliq-va-komissiyalar-sof-foydada.md) | Soliq va komissiyalar sof foydadan ayriladi: stavkalar `Setting` da oydan kuchga kiradigan ro'yxat (kodda yo'q), kanallar xaritasi `feeChannelOf`, yangi `QR` usuli, komissiya to'lov oyiga va ijtimoiy soliq oylik oyiga, `rasmiy = min(officialSalary, hisoblangan oylik)`, hisob bitta joyda `TaxCostsService`, kesh `v6`, `settings.tax` (faqat CEO); dividend 2-bosqichda | Qabul qilindi | 2026-10-25 |
```

New:

```markdown
| [0130](0130-soliq-va-komissiyalar-sof-foydada.md) | Soliq va komissiyalar sof foydadan ayriladi: stavkalar `Setting` da oydan kuchga kiradigan ro'yxat (kodda yo'q), kanallar xaritasi `feeChannelOf`, yangi `QR` usuli, komissiya to'lov oyiga va ijtimoiy soliq oylik oyiga, `rasmiy = min(officialSalary, hisoblangan oylik)`, hisob bitta joyda `TaxCostsService`, kesh `v6`, `settings.tax` (faqat CEO); dividend 2-bosqichda | Qabul qilindi | 2026-10-25 |
| [0131](0131-lernen-ormon-tema-sahna-va-joy-orinlari.md) | Ta'lim «O'rmon» temasi: `LernenTema` ga `UnitJoyi`, `Sahna`, `Miniatyura`; sahnani sahifa `SahnaRamka` da chizadi (fixed, rail'dan chiqib, yuklanayotganda ham); biom unit tartibidan; faqat transform/opacity, bitta rAF, yashirin/ekrandan tashqarida pauza, zaif qurilmada yarmi, ≤ 1500 element; sahnadagi umumiy matn parda ustida | Qabul qilindi | 2026-10-26 |
```

(Agar `main` dan yangi qator qo'shilgan bo'lsa — Old sifatida jadvalning haqiqiy oxirgi qatorini oling.)

- [ ] **Step 8: Update client/CLAUDE.md («Ta'lim look» paragraph)**

`client/CLAUDE.md` — Old:

```markdown
A theme only DRAWS — `LernenTema.TugunBelgisi` (the path node), `MukofotFoni` (the result screen's reward background) and `UnitLavha` (the unit page header), ADR-0128 — while the path, locks, points, the exercise screen, the confetti and the sound/Dafi decisions are shared and untouched.
```

New:

```markdown
A theme only DRAWS — `LernenTema.TugunBelgisi` (the path node), `MukofotFoni` (the result screen's reward background), `UnitLavha` (the unit page header), `UnitJoyi` (a lesson on the unit page), the optional `Sahna` (the background scene) and the optional `Miniatyura` (its card picture in Sozlamalar), ADR-0128 and ADR-0131 — while the path, locks, points, the exercise screen, the confetti and the sound/Dafi decisions are shared and untouched.
```

Old:

```markdown
The unit page's place cards use the Toza node model (`tema/toza/toza-tugun-model.ts`) directly; a theme with its own unit scene must move them into `UnitLavha` or a new slot.
```

New:

```markdown
**Scenes and places (ADR-0131).** The unit page draws every lesson through `tema.UnitJoyi` (Toza: the node-badge card, `tema/toza/toza-unit-joyi.tsx`; O'rmon: a hut, bridge, cave or castle by the lesson's kind, `placeForKind`). A theme's `Sahna` is drawn by the PAGE inside `SahnaRamka` (`tema/sahna-ramka.tsx`: `fixed`, `-z-10` under an `isolate` page root, `CONTENT_INSET` so it clears the rail, `aria-hidden`), before the loading state, so it stands while the data loads; it is told `unitTartibi`, the visible unit's order in its level (the path reports the unit through `LernenYol`'s `onUnitKorindi`; `joriyUnitTartibi` finds the order). Scene rules: only `transform` and `opacity` animate (`globals-css.test.ts` checks the `ormon-*` keyframes); one `requestAnimationFrame` per scene for the parallax (`harakat/use-sahna.ts`: `useParallaks` moves every `[data-omil]` layer by `layerOffset`), held while the tab is hidden or the scene is off screen (`useSahnaPauza`, `data-tinch`); layers are SVG tiles that wrap, so the DOM never grows with the path; blur is baked into the SVG, never a CSS `filter` on a moving layer, and nothing above a scene takes a `backdrop-filter`; a biome change is an opacity cross-fade of stacks that stay in the DOM (`visibility: hidden` when not shown); a weak device (`useYengilRejim`, assumed until the browser answers) draws half; «Kam harakat» is a still picture; at most 1500 elements (`ormon-sahna.test.ts`). Text the page draws straight on a scene sits on an opaque `bg-surface` plate (`SAHNA_PARDASI`, `SAHNA_PARDASI_KICHIK`, `SAHNA_KARTASI`) only when the theme has a scene, so «Toza»'s markup is unchanged; a theme's own text over its scene is measured at 4.5:1 or more from the real tokens (`ormon-kontrast.test.ts`, helpers in `test-support/hex-contrast.ts`). O'rmon (`tema/ormon/`): three biomes (`biomeForUnit`: tong, ko'l, kuz by the unit's order), its reward tokens `--ormon-*` in `.lumio` and `.dark .lumio`, its motion in the `.ormon-*` classes of `globals.css`.
```

- [ ] **Step 9: Commit**

```bash
git add client/src/components/student-portal/lernen/tema/ormon/ormon-miniatyura.tsx client/src/components/student-portal/lernen/tema/ormon/ormon-tema.ts client/src/components/student-portal/lernen/tema/ormon/ormon-tema.test.ts client/src/lib/lernen-temalar.ts client/src/lib/lernen-temalar.test.ts client/src/components/student-portal/lernen-korinish-tanlash.tsx client/src/components/student-portal/lernen-korinish-tanlash.test.ts docs/adr/0131-lernen-ormon-tema-sahna-va-joy-orinlari.md docs/adr/README.md client/CLAUDE.md
git commit -m "feat(lernen): offer the O'rmon look in Settings, with its card miniature

ADR-0131: the theme contract's scene and place slots and the scene performance
rules; client/CLAUDE.md follows.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Tekshiruv — to'liq darvozalar va brauzer ro'yxati

**Files:** o'zgarmaydi (faqat tekshiruv; topilgan xato tegishli taskning fayllarida tuzatiladi va alohida commit bo'ladi).

**Interfaces:**
- Consumes: Task 1–10 ning hammasi.
- Produces: yashil darvozalar va nazoratchi uchun brauzer ro'yxati.

- [ ] **Step 1: Full client test suite**

Run: `cd client && npx vitest run`
Expected: hammasi PASS (yangi: `parallaks`, `ormon-*`, `sahna-ramka`, `lernen-levels-page`, `joriy-unit`, `lernen-unit-page` O'rmon bloki, `globals-css` O'rmon bloki, `lernen-korinish-tanlash`, `lernen-temalar`).

- [ ] **Step 2: i18n coverage**

Run: `cd client && npm run i18n:check`
Expected: PASS (`STRICT_FILES` ga `toza-unit-joyi.tsx`, `ormon-tugun.tsx`, `ormon-joy.tsx` qo'shilgan; yangi kalit yo'q, eskirgan kalit yo'q).

- [ ] **Step 3: Types**

Run: `cd client && npx tsc --noEmit`
Expected: xatosiz.

- [ ] **Step 4: Lint**

Run: `cd client && npx eslint src`
Expected: `✖ N problems (0 errors, …)` qatorida errors = 0 (ogohlantirishlar soni `main` dagidan oshmasin). Prettier ISHLATILMAYDI.

- [ ] **Step 5: Production build (testlardan keyin, parallel emas)**

Run: `cd client && npx next build`
Expected: muvaffaqiyatli; `/portal/lernen` va `/portal/lernen/units/[id]` xatosiz quriladi.

- [ ] **Step 6: Boundary checks**

Run: `git diff --stat origin/main -- server/`
Expected: bo'sh (server va Prisma tegilmagan).

Run: `git diff --stat origin/main -- client/src/components/student-portal/lernen/yol/yol-tuzilishi.ts client/src/components/student-portal/lernen/fortschritt.ts client/src/components/student-portal/lernen/seans-navbat.ts client/src/components/student-portal/lernen/yol/yopishqoq-unit-lavha.tsx`
Expected: bo'sh (yo'l mantig'i va `DARAJA_FONI` fayli tegilmagan).

Run: `grep -rln "gsap" client/src --include='*.ts' --include='*.tsx'`
Expected: faqat `client/src/components/student-portal/lernen/dafi/` ostidagi fayllar.

Run: `wc -l client/src/components/student-portal/lernen/tema/ormon/*.ts* client/src/components/student-portal/lernen/tema/sahna-ramka.tsx client/src/components/student-portal/lernen/harakat/use-sahna.ts client/src/components/student-portal/lernen/harakat/parallaks.ts client/src/test-support/hex-contrast.ts`
Expected: har yangi fayl ≤ 500 qator.

- [ ] **Step 7: Browser checklist (nazoratchi bajaradi: mock API + Playwright)**

Profil javobida `lernenTema: "ormon"` (yoki Sozlamalarda tanlab). Har band uchun skrinshot.

1. **Sozlamalar → «Ta'lim ko'rinishi»:** ikki karta — «Toza» (rang nuqtasi) va «O'rmon» (miniatyura); O'rmon tanlanadi, qayta yuklashda ham tanlangan.
2. **Yo'l, 3 skroll nuqtasi** (tepa; joriy unit; pastki unit): sahna butun ekranni to'ldiradi, hech qayerda oq bo'shliq yo'q; unitlar yopishqoq chiziqdan o'tganda biom tong → ko'l → kuz bo'lib yumshoq almashadi (700 ms); skrollda yaqin buta qatlami uzoq tepaliklardan tezroq siljiydi; uchqunlar miltillaydi, nur dastasi va tuman sekin suzadi; sarlavha, daraja yorlig'i va bo'lim nomi oq parda ustida o'qiladi; tugun yorlig'i parda ustida.
3. **Yuklanish va xato:** so'rov kechiktirilganda skelet ostida sahna turadi; so'rov yiqilganda «Ma'lumotni yuklab bo'lmadi» kartasi parda ustida.
4. **Unit sahifasi:** unit tartibi 1/2/3 → tong/ko'l/kuz; lavha biom rangida, Dafi salom beradi; darslar kulba/ko'prik/g'or/qal'a bo'lib chap-o'ng almashadi; qulflangan joy tumanda, bosilsa qisqa «tuk» va hech qayerga o'tmaydi; joriy joy yalpiz halqa, belgisi «nafas oladi», «Boshlash»; tugagan joyda «Yana mashq qilish · N yangi so'z» amber.
5. **Natija ekrani** (dars tugagach): och yalpiz o'rmon foni, bayramda sekin aylanuvchi nur; sarlavha va qator o'qiladi; konfeti, `mukofot` ovozi va Dafi sakrashi avvalgidek (tema ularni o'zgartirmaydi); yakuniy sinovdan o'tilmaganda nur yo'q.
6. **Qorong'u rejim:** sahna ustida qorong'u parda; pardalar va joy kartalari to'q sirt; matn o'qiladi; natija foni chuqur yashil.
7. **360 px telefon** (pastki navigatsiya sahna ustida, hech narsa kesilmaydi, gorizontal skroll yo'q) va **desktop rail bilan** (kengaytirilgan va yig'ilgan): sahna rail chetidan boshlanadi, rail ostiga kirmaydi.
8. **Kam harakat** (qurilma kaliti, keyin tizim `prefers-reduced-motion`): skrollda qatlamlar qimirlamaydi; uchqun va barg yo'q; nur va tuman to'xtagan; biom darrov almashadi; tugun halqasi va joy belgisi to'xtagan; natijada nur aylanmaydi. Kalit o'chirilganda hammasi qaytadi.
9. **Zaif qurilma** (`addInitScript` bilan `navigator.hardwareConcurrency = 4`): DOMda `-far-tile` yo'q, uchqunlar 2 ta.
10. **Pauza:** tab yashirilib qaytarilganda sahna ildizida `data-tinch` paydo bo'ladi va yo'qoladi; animatsiyalar davom etadi.
11. **Element soni:** `document.querySelectorAll('[data-sahna="ormon"] *').length` ≤ 1500 (kutilgan ~400 to'liq rejimda).
12. **Unumdorlik:** Chrome Performance, CPU 4× sekinlashtirish, yo'lni skroll qilish — kadrlarda katta Paint yo'q (faqat Composite); «Paint flashing» skrollda sahna qatlamlarini bo'yamaydi.
13. **ru/de:** Sozlamalarda «Лес» / «Wald» va izohlari; unit sahifasida «Boshlash» tarjimasi; qulflangan joyning ekran o'quvchi nomi tarjima qilingan; ekranda inglizcha so'z yo'q.
14. **«Toza» o'zgarmagan:** «Toza»ga qaytilganda yo'l va unit sahifasi oldingidek — sahna yo'q, parda yo'q, kartalar avvalgi ko'rinishda.

- [ ] **Step 8: Report**

Hech narsa commit qilinmaydi (bu task fayl o'zgartirmaydi). Nazoratchiga: 1–6-qadam natijalari (sonlar bilan), brauzer ro'yxatidagi har bandning holati va skrinshotlar.

---

## Spec qamrovi

| Spec | Qayerda |
|---|---|
| §5 `Sahna` o'rni, qatlamlar `absolute`, faqat `transform`/`opacity`, bitta rAF, `visibilitychange` + `IntersectionObserver` | Task 1, 4, 5, 9 |
| §5 `palitraUnitga(unitIndeksi)` | Task 2 (`biomeForUnit`), Task 9 (`joriyUnitTartibi`) |
| §7 kartada miniatyura, faqat tayyor temalar | Task 10 |
| §8 O'rmon: 3 biom, uchqunlar, nur, parallaks; unit sahnasi kulba/ko'prik/g'or/qal'a; qulflilar tumanda; bo'shliq yo'q | Task 2–9 |
| §9 kam harakat — parallaks/ambient o'chadi; yengil rejim yarmi | Task 2, 4, 5 |
| §10 `.lumio` tokenlari, rail'dan chiqish, yuklanayotganda ham fon, prettier yo'q, o'zbekcha matn | Task 4, 8, 9, Global Constraints |
| §11 testlar (sof, statik markup), ≤ 1500 element, qo'lda tekshiruv | har task, Task 5, Task 11 |
| §12 3-bosqich alohida PR, ADR | Task 10 (ADR-0131) |
| §14 zaif telefon, emoji o'rniga SVG/phosphor | Task 5, 7 |

