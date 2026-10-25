# Ta'lim dizayni — 2-bosqich (mashq, natija, unit sahifasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mashq ekrani (yumshoq xato, javob ovozi va Dafi), natija ekrani (mukofot: ovoz, konfeti, Dafi 3 sakrashi, uchta karta) va unit sahifasini (daraja rangidagi lavha + «joy» kartalari) «Toza» ko'rinishida qurish; tema shartnomasiga `MukofotFoni` va `UnitLavha` o'rinlarini qo'shish.

**Architecture:** Hamma qaror sof, testlangan kichik funksiyalarda (`uebung/hissiyot.ts`, `uebung/konfeti.ts`, `seans-chizigi.tsx` ning `chiziqFoizi`); komponentlar faqat chizadi. `seans-ekrani.tsx` (1031 qator, testsiz) ga faqat «yelim» qo'shiladi: mutatsiya callback'lariga ovoz/Dafi chaqiruvi va render o'rinlari; holat mashinasi (`seans-navbat.ts`, `fortschritt.ts`) tegilmaydi. Tema faqat fon va lavhani chizadi (`LernenTema.MukofotFoni`, `LernenTema.UnitLavha`); mashq chrome'i, konfeti, sanoq, ovoz va Dafi qarorlari hamma temada bir xil.

**Tech Stack:** Next.js 16 + React 19 + Tailwind 4 (client), `gsap` (faqat Dafi ichida, lazy), Web Audio (`ovoz/`), Canvas 2D (konfeti), Vitest node-muhiti (DOM yo'q, `renderToStaticMarkup` mumkin).

**Spec:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§3, §8, §9, §12 bosqich 2) · **ADR:** `docs/adr/0125-lernen-korinish-oquvchi-hisobida-tanlanadi.md` · **Mockup:** `docs/superpowers/mockups/2026-10-24-lernen-dizayn/duo.html` (`.lesson`, `.fb`, `.res`, `confetti()`) · **1-bosqich rejasi (format namunasi):** `docs/superpowers/plans/2026-10-24-lernen-dizayn-asos.md`.

> **Qamrov:** spec §12 ning faqat **2-bosqichi**. Eski ekranlar (`lernen-lesson-page.tsx`, `mc-exercise.tsx`, `vocab-drill.tsx`) va O'rmon/Dengiz/Nemis temalari (3–5-bosqich) KIRMAYDI. Server o'zgarishi va migratsiya YO'Q.

## Global Constraints

Spec, 1-bosqich qoidalari va CEO qarorlaridan; har task uchun majburiy:

- **Ish joyi:** worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/lernen-dizayn`, shox `feat/lernen-mashq-natija`. Bash buyruqlari shu papkadan (`cd client && …` shu papkaga nisbatan); worktree'dan tashqariga `cd` QILINMAYDI. `client/node_modules` o'rnatilgan.
- **Server o'zgarmaydi:** `server/` ga va Prisma sxemasiga tegilmaydi. Biror task server o'zgarishini talab qilsa — to'xtab, nazoratchiga aytiladi (jimgina qo'shilmaydi).
- **Mantiq tegilmaydi:** `lernen/seans-navbat.ts`, `lernen/fortschritt.ts`, `lernen/yol/yol-tuzilishi.ts` o'zgarmaydi. `uebung/seans-ekrani.tsx` da faqat yelim: importlar, hook chaqiruvlari, mutatsiya `onSuccess` ichidagi chaqiruvlar, render o'rinlari va bitta prop. Effektlarning bog'liqlik ro'yxatlari (`[holat]`, klaviatura effekti) O'ZGARMAYDI. Yangi mantiq yangi kichik faylga, node testi bilan.
- **Tema faqat chizadi:** `LernenTema = { id, TugunBelgisi, MukofotFoni, UnitLavha }` (Task 7). Mashq sarlavhasi, variantlar, pastki panel, konfeti, ball sanog'i, ovoz va Dafi qarorlari temaga bog'liq emas.
- **Xato javob yumshoq (spec §3, duo.html):** amber, hech qachon qizil emas. Javob vidjetlari (`tanlash`, `rasm-tanlash`, `uhr-tanlash`, `yozish`, `yigish`, `javob-paneli`; Task 3 dan) va natija ekrani (`natija-ekrani`, `natija-sahna`; Task 8 dan) da `bg-danger`/`text-danger`/`border-danger` bo'lmaydi; rang `uebung/javob-ohangi.ts` dan. Matn: «Deyarli!» + «To'g'ri javob:» + so'z. Tarmoq xatosi («Yuborib bo'lmadi…») xato javob EMAS — u `text-danger` bo'lib qoladi.
- **Ovoz qoidalari:** `togri`/`xato` faqat server hukmi callback'idan (`pruefen` `onSuccess`, juftlashda har juftning `onSuccess`), `natija` ustidagi effektdan EMAS; juftlashning sintetik yakuniy natijasida va tarmoq xatosida ovoz yo'q. `ovozniUygot()` bosishning o'zida (`tekshir`, `onJuft`; Enter yo'li `tekshir` orqali). Ovoz motori chunk'i oldindan yuklanadi (`import("…/ovoz/ovoz-motor").catch(() => {})`), chunki seans/unit sahifasi URL bilan ochiladi. `unitOchildi` faqat yo'l varag'idagi «Boshlash» da qoladi (allaqachon bor). `mukofot` natija ekranida bir marta.
- **Bayram qoidasi (`natijaHissiyoti`):** oddiy dars va takrorlash — har doim; yakuniy sinov — faqat server `tayyor` + `bestanden` desa. Kutilayotganda Dafi «o'ylayapti», o'tilmasa Dafi «xato», `mukofot` va konfeti yo'q; so'rov yiqilsa Dafi «tinch». Bir martalik (React StrictMode'ning ikkinchi effekt yugurishida ham — ref bilan).
- **Kam harakat:** tizim YOKI qurilma «Kam harakat» (`kamHarakatHozir()` callback/effektda, `useKamHarakat()` renderda). Ekran ildizlari (`seans-ekrani` savol ko'rinishi, `natija-ekrani`, `lernen-unit-page`) `data-kam-harakat` oladi; CSS (`globals.css`) `lumio-fade-up`, `lumio-stagger`, `lumio-shake` ni shu belgi ostida tizim qoidasi bilan bir xil yechadi; o'tishlar `motion-reduce:transition-none in-data-[kam-harakat]:transition-none`. Kam harakatda: konfeti yo'q, sanoq yo'q (allaqachon), Dafi statik (rig o'zi), ovoz alohida (o'chirilmagan bo'lsa chaladi).
- **`gsap`:** faqat `dafi.tsx` ichidagi `import("gsap")`; boshqa joyda `gsap` import qilinmaydi.
- **`.lumio` tokenlari:** faqat mavjud Lumio sinflari va `var(--…)` (masalan `--amber-500`, `--success`, `--surface-card`); global `@theme` ga yangi nom qo'shilmaydi (`globals-css.test.ts`). `globals.css` da CSS izohi deklaratsiya qiymati ichiga yozilmaydi (Lightning CSS butun blokni tashlab yuboradi) — izoh deklaratsiyadan yuqorida.
- **i18n:** yangi `t("…")` matni faqat `STRICT_FILES` dagi faylda (`client/src/i18n/i18n-coverage.test.ts`; yangi fayl ro'yxatga qo'shiladi), `ru`/`de`/`en` lug'atlariga yoziladi: yangi yozuvlar `};\n\nexport default xx;` dan OLDIN, mavjud kalit takrorlanmaydi (avval `grep`). Ishlatilmay qolgan kalit lug'atlardan o'chiriladi (test «unused key» da yiqiladi). Ma'lumot (`t()` ga hech qachon): nemis so'zlari, server matni, `titleDe`, `label`. Matnlar o'zbek (lotin), inglizcha so'z yo'q.
- **Tahrir usuli:** katta mavjud fayllarda faqat rejadagi aniq old→new Edit'lar; «butun fayl (Write)» deyilgan joyda avval faylni Read qiling (tool shuni talab qiladi), keyin rejadagi matnni to'liq yozing.
- **Format:** `client/` da Prettier ISHLATILMAYDI. Yangi fayl 500 qatordan oshmaydi. Kod izohlari va commit xabarlari INGLIZCHA; har commit oxirida `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Testlar:** `cd client && npx vitest run <yo'l>` (agar `configLoader` xatosi chiqsa: `npx vitest --config vitest.config.mts run <yo'l>`). Vitest DOM'siz: hook/effekt testlanmaydi — sof funksiya va statik markup testlanadi; brauzerdagina ko'rinadigan narsa Task 10 ro'yxatida. Bir xil buyruqni kod o'zgarmasdan qayta yugurtirmang. `npm run build` testlar bilan PARALLEL ishlatilmaydi.

## File Structure

**Yangi** (`client/src/components/student-portal/lernen/…`):
- `uebung/hissiyot.ts` (+`hissiyot.test.ts`) — `javobEffekti`, `natijaHissiyoti`, `aniqlikFoizi`, `panelOhangi`: sof qarorlar.
- `uebung/javob-ohangi.ts` (+`javob-ohangi.test.ts`) — yumshoq xato sinflari + vidjetlarda `danger` yo'qligi qo'riqchisi.
- `uebung/seans-chizigi.tsx` (+test) — mashq sarlavhasidagi ilgarilash chizig'i.
- `uebung/use-javob-sezgisi.ts` — seansdagi hukm ovozi + Dafi holati (hook).
- `uebung/konfeti.ts` (+test) — konfeti fizikasi (sof); `uebung/konfeti-tuval.tsx` (+test) — canvas.
- `uebung/sanoq.ts` — `useSanaladiganBall` (natija-ekrani'dan ko'chiriladi).
- `uebung/natija-sahna.tsx` (+test) — natija ekranining tepasi: Dafi lg, sarlavha, uchta karta, mukofot, konfeti.
- `uebung/natija-ekrani.test.ts` — natija ekranining bayram/xato simlari.
- `tema/toza/toza-mukofot-foni.tsx`, `tema/toza/toza-unit-lavha.tsx` (+`toza-orinlar.test.ts`).

**O'zgaradi:**
- `client/src/app/globals.css` (+`globals-css.test.ts`) — `data-kam-harakat` qoidasi.
- `uebung/tanlash.tsx`, `rasm-tanlash.tsx`, `uhr-tanlash.tsx`, `yozish.tsx`, `yigish.tsx`, `javob-paneli.tsx`, `natija-xabari.ts` (+test), `pastki-panel.tsx` (+test), `seans-ekrani.tsx`, `natija-ekrani.tsx`.
- `dafi/dafi.tsx` — `tetik` prop.
- `tema/tema-turlari.ts`, `tema/toza/toza-tema.ts`, `tema/tema-reyestri.test.ts`, `tema/toza/toza-tugun-model.ts` (+test), `yol/yopishqoq-unit-lavha.tsx` (rang xaritasi eksport).
- `lernen-unit-page.tsx` (+`lernen-unit-page.test.ts`).
- `client/src/i18n/dictionaries/{ru,de,en}.ts`, `client/src/i18n/i18n-coverage.test.ts`.

**Hujjatlar:** `docs/adr/0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md`, `docs/adr/README.md`, `client/CLAUDE.md`.

Yo'l qisqartmasi: quyida `L/` = `client/src/components/student-portal/lernen/`.

---

### Task 1: Client — mashq va natija qarorlari (sof model)

**Files:**
- Create: `L/uebung/hissiyot.ts`
- Test: `L/uebung/hissiyot.test.ts`

**Interfaces:**
- Consumes: `javobHolati(togri: boolean): DafiHolat`, `type DafiHolat` (`L/dafi/dafi-holat.ts`); `type SinovHolati` (`L/uebung/sinov-natijasi.ts`: `{tur:"kutilmoqda"} | {tur:"xato"} | {tur:"tayyor"; natija: YakuniySinovNatijasi}`); `type PruefErgebnis` (`L/types.ts`).
- Produces:
  - `javobEffekti(isCorrect: boolean): { ovoz: "togri" | "xato"; dafi: DafiHolat }`
  - `interface NatijaHissiyoti { bayram: boolean; dafi: DafiHolat }`
  - `natijaHissiyoti(sinov: SinovHolati | null | undefined): NatijaHissiyoti`
  - `aniqlikFoizi(togri: number, jami: number): number`
  - `panelOhangi(natija: Pick<PruefErgebnis, "isCorrect"> | null, juftlash: boolean): "togri" | "xato" | null`

- [ ] **Step 1: Check the branch**

Run: `git branch --show-current`
Expected: `feat/lernen-mashq-natija`.

- [ ] **Step 2: Write the failing test**

`L/uebung/hissiyot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aniqlikFoizi, javobEffekti, natijaHissiyoti, panelOhangi } from "./hissiyot";

const tayyor = (bestanden: boolean, avvalOtilgan = false) => ({
  tur: "tayyor" as const,
  natija: { bestanden, avvalOtilgan, togri: 12, jami: 15, kerak: 14 },
});

describe("javobEffekti", () => {
  it("a right answer rings and Dafi cheers", () => {
    expect(javobEffekti(true)).toEqual({ ovoz: "togri", dafi: "bayram" });
  });
  it("a wrong one is the soft miss, never a buzzer", () => {
    expect(javobEffekti(false)).toEqual({ ovoz: "xato", dafi: "xato" });
  });
});

describe("natijaHissiyoti", () => {
  it("an ordinary lesson or a review always celebrates", () => {
    expect(natijaHissiyoti(null)).toEqual({ bayram: true, dafi: "bayram" });
    expect(natijaHissiyoti(undefined)).toEqual({ bayram: true, dafi: "bayram" });
  });
  it("a final test waits for the server: Dafi thinks, nothing is celebrated yet", () => {
    expect(natijaHissiyoti({ tur: "kutilmoqda" })).toEqual({ bayram: false, dafi: "oylayapti" });
  });
  it("celebrates a final test only when the server says it was passed", () => {
    expect(natijaHissiyoti(tayyor(true))).toEqual({ bayram: true, dafi: "bayram" });
  });
  it("a failed attempt gets the soft miss, also when the test was passed before", () => {
    expect(natijaHissiyoti(tayyor(false))).toEqual({ bayram: false, dafi: "xato" });
    expect(natijaHissiyoti(tayyor(false, true))).toEqual({ bayram: false, dafi: "xato" });
  });
  it("a request that failed is not the student's miss: Dafi stays calm", () => {
    expect(natijaHissiyoti({ tur: "xato" })).toEqual({ bayram: false, dafi: "tinch" });
  });
});

describe("aniqlikFoizi", () => {
  it("is the whole percent of right answers", () => {
    expect(aniqlikFoizi(12, 15)).toBe(80);
    expect(aniqlikFoizi(2, 3)).toBe(67);
    expect(aniqlikFoizi(15, 15)).toBe(100);
  });
  it("is 0 for an empty session", () => {
    expect(aniqlikFoizi(0, 0)).toBe(0);
  });
});

describe("panelOhangi", () => {
  it("has no tint before the check", () => {
    expect(panelOhangi(null, false)).toBeNull();
    expect(panelOhangi(null, true)).toBeNull();
  });
  it("is green after a right answer and the soft amber after a miss", () => {
    expect(panelOhangi({ isCorrect: true }, false)).toBe("togri");
    expect(panelOhangi({ isCorrect: false }, false)).toBe("xato");
  });
  it("a pairing question always ends with a green board: a first-try slip is not tinted amber", () => {
    expect(panelOhangi({ isCorrect: true }, true)).toBe("togri");
    expect(panelOhangi({ isCorrect: false }, true)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/hissiyot.test.ts`
Expected: FAIL — `./hissiyot` moduli topilmadi.

- [ ] **Step 4: Implement**

`L/uebung/hissiyot.ts`:

```ts
import { javobHolati, type DafiHolat } from "../dafi/dafi-holat";
import type { PruefErgebnis } from "../types";
import type { SinovHolati } from "./sinov-natijasi";

/**
 * A checked answer's sound and Dafi's state (spec §9). A wrong answer is the
 * soft miss: a gentle sound and Dafi's sympathetic face, never a buzzer.
 */
export function javobEffekti(isCorrect: boolean): { ovoz: "togri" | "xato"; dafi: DafiHolat } {
  return { ovoz: isCorrect ? "togri" : "xato", dafi: javobHolati(isCorrect) };
}

export interface NatijaHissiyoti {
  /** The reward sound (once), the confetti and Dafi's three hops. */
  bayram: boolean;
  dafi: DafiHolat;
}

/**
 * How the result screen feels (ADR-0128). An ordinary lesson and a review
 * always celebrate. A final test celebrates only once the SERVER says it was
 * passed — the client never guesses from its own count (`sinov-natijasi.ts`).
 * While the server decides Dafi thinks; a failed attempt gets the soft miss;
 * a request that failed is not the student's doing, so he stays calm.
 */
export function natijaHissiyoti(sinov: SinovHolati | null | undefined): NatijaHissiyoti {
  if (!sinov) return { bayram: true, dafi: "bayram" };
  if (sinov.tur === "kutilmoqda") return { bayram: false, dafi: "oylayapti" };
  if (sinov.tur === "xato") return { bayram: false, dafi: "tinch" };
  return sinov.natija.bestanden ? { bayram: true, dafi: "bayram" } : { bayram: false, dafi: "xato" };
}

/** The result card's accuracy: whole percent of right answers, 0 for an empty session. */
export function aniqlikFoizi(togri: number, jami: number): number {
  return jami > 0 ? Math.round((togri / jami) * 100) : 0;
}

/**
 * The bottom bar's tint after a check. A pairing question ends only when the
 * whole board is green, so a first-try slip there is not painted amber: the
 * panel only says the question will come back.
 */
export function panelOhangi(
  natija: Pick<PruefErgebnis, "isCorrect"> | null,
  juftlash: boolean,
): "togri" | "xato" | null {
  if (!natija) return null;
  if (natija.isCorrect) return "togri";
  return juftlash ? null : "xato";
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/hissiyot.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/uebung/hissiyot.ts client/src/components/student-portal/lernen/uebung/hissiyot.test.ts
git commit -m "feat(lernen): pure rules for answer feedback and the result celebration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client — qurilma «Kam harakat» kaliti fade/stagger/shake ga yetadi

**Files:**
- Modify: `client/src/app/globals.css` (≈861–865, pulsatsiya halqasi qoidasidan keyin)
- Test: `client/src/app/globals-css.test.ts`

**Interfaces:**
- Consumes: mavjud `.lumio .lumio-fade-up`, `.lumio .lumio-stagger > *`, `.lumio .lumio-shake` animatsiyalari; tizim qoidasi (`@media (prefers-reduced-motion: reduce)` ichida `animation-duration: 0.001ms; animation-delay: 0ms`).
- Produces: CSS shartnomasi — har qanday `data-kam-harakat` atributli ajdod ostida `lumio-fade-up`, `lumio-stagger` bolalari va `lumio-shake` darrov oxirgi holatga keladi. Task 8 (`natija-ekrani` ildizi) va Task 9 (`Screen` ildizi) shu atributni qo'yadi.

- [ ] **Step 1: Write the failing test**

`client/src/app/globals-css.test.ts` faylining OXIRIGA qo'shing (importlar allaqachon bor):

```ts
describe("the device's «Kam harakat» switch", () => {
  // `useKamHarakat` marks a screen root with `data-kam-harakat`; until now only
  // the pulse ring listened to it, so the result screen's fade and the unit
  // page's stagger still moved for a student who had asked for less motion.
  it("resolves the entrance fades, the stagger and the shake at once, like the system setting", () => {
    const css = readFileSync(path.join(__dirname, "globals.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(
      ".lumio [data-kam-harakat] .lumio-fade-up, .lumio [data-kam-harakat] .lumio-stagger > *, .lumio [data-kam-harakat] .lumio-shake { animation-duration: 0.001ms; animation-delay: 0ms; }",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/app/globals-css.test.ts`
Expected: FAIL — `expected … to contain ".lumio [data-kam-harakat] .lumio-fade-up, …"`.

- [ ] **Step 3: Add the rule**

`client/src/app/globals.css` — Edit, old:

```css
/* The device's own "Kam harakat" switch (Ta'lim path root carries the
   attribute) stops the ring like the system setting below does. */
.lumio [data-kam-harakat] .lumio-pulse-ring {
  animation: none;
}
```

new:

```css
/* The device's own "Kam harakat" switch (Ta'lim path root carries the
   attribute) stops the ring like the system setting below does. */
.lumio [data-kam-harakat] .lumio-pulse-ring {
  animation: none;
}

/* The same switch on a screen root (result screen, unit page) resolves the
   entrance fades and staggers and the shake at once, exactly as the system
   setting does in the media query below. */
.lumio [data-kam-harakat] .lumio-fade-up,
.lumio [data-kam-harakat] .lumio-stagger > *,
.lumio [data-kam-harakat] .lumio-shake {
  animation-duration: 0.001ms;
  animation-delay: 0ms;
}
```

(Qoida `@layer` va `@media` dan TASHQARIDA turadi — `.lumio .lumio-fade-up` `@layer components` ichida, qatlamsiz qoida uni yengadi.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run src/app/globals-css.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add client/src/app/globals.css client/src/app/globals-css.test.ts
git commit -m "fix(lernen): device reduced-motion switch also resolves fade, stagger and shake

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — xato javob yumshoq «Deyarli!» (amber, qizil emas)

**Files:**
- Create: `L/uebung/javob-ohangi.ts`
- Test: `L/uebung/javob-ohangi.test.ts`
- Modify: `L/uebung/tanlash.tsx`, `L/uebung/rasm-tanlash.tsx`, `L/uebung/uhr-tanlash.tsx`, `L/uebung/yozish.tsx`, `L/uebung/yigish.tsx`, `L/uebung/javob-paneli.tsx`, `L/uebung/natija-xabari.ts`, `L/uebung/natija-xabari.test.ts`
- Modify: `client/src/i18n/dictionaries/ru.ts`, `de.ts`, `en.ts`

**Interfaces:**
- Consumes: `javobPaneliMatni(natija, t)` (mavjud, `natija-xabari.ts`).
- Produces:
  - `XATO_SINFI = "border-amber-500 bg-amber-500/10 text-ink-800"`, `XATO_FONI = "bg-amber-500/10 text-ink-800"`, `XATO_CHEGARASI = "border-amber-500"`, `XATO_BELGISI = "text-amber-600"`, `XATO_SARLAVHASI = "text-amber-700"` (`javob-ohangi.ts`).
  - `javobPaneliMatni` xato javobda: `{ sarlavha: t("Deyarli!"), izoh: soz ? t("To'g'ri javob:") : null, soz }` (`soz = loesungWort ?? richtig`).
  - `javob-ohangi.test.ts` dagi `JAVOB_FAYLLARI` ro'yxati (Task 8 unga ikki fayl qo'shadi).
  - Lug'at: `"Deyarli!"` qo'shiladi, `"Noto'g'ri"` o'chiriladi.
  - `JavobPaneli` endi o'z fonini chizmaydi: fonni `PastkiPanel` ning `ohang` i beradi (Task 4 da yoziladi, Task 5 da ulanadi; oraliq commit'larda panel tussiz — kutilgan holat).

- [ ] **Step 1: Write the failing tests**

`L/uebung/javob-ohangi.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  XATO_BELGISI,
  XATO_CHEGARASI,
  XATO_FONI,
  XATO_SARLAVHASI,
  XATO_SINFI,
} from "./javob-ohangi";

// Spec §3, ADR-0128: a wrong answer is the soft «almost», never a red wall.
const JAVOB_FAYLLARI = [
  "tanlash.tsx",
  "rasm-tanlash.tsx",
  "uhr-tanlash.tsx",
  "yozish.tsx",
  "yigish.tsx",
  "javob-paneli.tsx",
];

describe("the soft miss", () => {
  it("is amber, never the danger red", () => {
    for (const sinf of [XATO_SINFI, XATO_FONI, XATO_CHEGARASI, XATO_BELGISI, XATO_SARLAVHASI]) {
      expect(sinf).toContain("amber");
      expect(sinf).not.toContain("danger");
    }
  });

  it.each(JAVOB_FAYLLARI)("%s paints no answer red", (fayl) => {
    const manba = readFileSync(path.join(__dirname, fayl), "utf8");
    expect(manba).not.toMatch(/\b(?:bg|text|border)-danger\b/);
  });
});
```

`L/uebung/natija-xabari.test.ts` — Edit, old:

```ts
  it("a wrong answer shows the right one", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "Bahnhof" })).toEqual({
      sarlavha: "Noto'g'ri",
      izoh: null,
      soz: "Bahnhof",
    });
  });
```

new:

```ts
  it("a wrong answer is the soft «almost» and shows the right one", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "Bahnhof" })).toEqual({
      sarlavha: "Deyarli!",
      izoh: "To'g'ri javob:",
      soz: "Bahnhof",
    });
  });

  it("a wrong answer with no word to show says only «almost»", () => {
    expect(javobPaneliMatni({ isCorrect: false, richtig: "" })).toEqual({
      sarlavha: "Deyarli!",
      izoh: null,
      soz: "",
    });
  });
```

Va xuddi shu faylda, old:

```ts
    expect(javobPaneliMatni({ isCorrect: false, richtig: "der Bahnhof" }, tr)).toEqual({
      sarlavha: "[Noto'g'ri]",
      izoh: null,
      soz: "der Bahnhof",
    });
```

new:

```ts
    expect(javobPaneliMatni({ isCorrect: false, richtig: "der Bahnhof" }, tr)).toEqual({
      sarlavha: "[Deyarli!]",
      izoh: "[To'g'ri javob:]",
      soz: "der Bahnhof",
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/javob-ohangi.test.ts src/components/student-portal/lernen/uebung/natija-xabari.test.ts`
Expected: FAIL — `./javob-ohangi` topilmadi; `natija-xabari` da `expected "Noto'g'ri" to equal "Deyarli!"`.

- [ ] **Step 3: Write the tone constants**

`L/uebung/javob-ohangi.ts`:

```ts
/**
 * The soft miss (spec §3, ADR-0128): a wrong answer is «almost», painted in
 * the warm amber of duo.html, never the danger red. One place for the tone,
 * so every answer widget says it the same way.
 */

/** A whole answer surface: an option, the typed field, the built sentence. */
export const XATO_SINFI = "border-amber-500 bg-amber-500/10 text-ink-800";
/** A tile inside an answer surface. */
export const XATO_FONI = "bg-amber-500/10 text-ink-800";
/** A picture or clock card: only its frame changes. */
export const XATO_CHEGARASI = "border-amber-500";
/** The mark beside a missed choice (it carries the meaning without colour too). */
export const XATO_BELGISI = "text-amber-600";
/** The «Deyarli!» heading: bold and large, where this amber reads well. */
export const XATO_SARLAVHASI = "text-amber-700";
```

- [ ] **Step 4: Repaint the answer widgets**

`L/uebung/tanlash.tsx` — Edit 1, old:

```tsx
import { DeWort } from "./de-wort";
```

new:

```tsx
import { DeWort } from "./de-wort";
import { XATO_BELGISI, XATO_SINFI } from "./javob-ohangi";
```

Edit 2, old:

```tsx
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition-colors",
              "border-transparent bg-tint text-ink-800",
              bosilgan && !natija && "border-coral-500 bg-coral-500/10",
              togri && "border-success bg-success/10 text-success",
              xatoTanlov && "border-danger bg-danger/10 text-danger",
              (natija != null || kutilmoqda) && "cursor-default",
            )}
```

new:

```tsx
            className={cn(
              // A chunky option with a darker lip that sinks when pressed (the «Toza» look, duo.html `.opt`).
              "flex w-full items-center gap-2.5 rounded-2xl border-2 border-b-[5px] px-4 py-3.5 text-left font-semibold",
              "transition-[color,background-color,border-color,transform] duration-150 motion-reduce:transition-none",
              "border-line bg-surface text-ink-800",
              natija == null && !kutilmoqda && "active:translate-y-[3px]",
              bosilgan && !natija && "border-coral-500 bg-coral-500/10",
              togri && "border-success bg-success/10 text-success",
              xatoTanlov && XATO_SINFI,
              (natija != null || kutilmoqda) && "cursor-default",
            )}
```

Edit 3, old:

```tsx
            ) : xatoTanlov ? (
              <XCircle size={20} weight="fill" />
            ) : null}
```

new:

```tsx
            ) : xatoTanlov ? (
              <XCircle size={20} weight="fill" className={XATO_BELGISI} />
            ) : null}
```

`L/uebung/rasm-tanlash.tsx` — Edit 1, old:

```tsx
import type { PruefErgebnis } from "../types";
```

new:

```tsx
import type { PruefErgebnis } from "../types";
import { XATO_BELGISI, XATO_CHEGARASI } from "./javob-ohangi";
```

Edit 2, old:

```tsx
              xatoTanlov && "border-danger",
```

new:

```tsx
              xatoTanlov && XATO_CHEGARASI,
```

Edit 3, old:

```tsx
                className="absolute right-2 top-2 rounded-full bg-white text-danger"
```

new:

```tsx
                className={cn("absolute right-2 top-2 rounded-full bg-white", XATO_BELGISI)}
```

`L/uebung/uhr-tanlash.tsx` — Edit 1, old:

```tsx
import type { PruefErgebnis } from "../types";
```

new:

```tsx
import type { PruefErgebnis } from "../types";
import { XATO_BELGISI, XATO_CHEGARASI } from "./javob-ohangi";
```

Edit 2, old:

```tsx
              xatoTanlov && "border-danger",
```

new:

```tsx
              xatoTanlov && XATO_CHEGARASI,
```

Edit 3, old:

```tsx
              <XCircle size={28} weight="fill" className="absolute right-2 top-2 rounded-full bg-white text-danger" />
```

new:

```tsx
              <XCircle size={28} weight="fill" className={cn("absolute right-2 top-2 rounded-full bg-white", XATO_BELGISI)} />
```

`L/uebung/yozish.tsx` — Edit 1, old:

```tsx
import type { PruefErgebnis } from "../types";
```

new:

```tsx
import type { PruefErgebnis } from "../types";
import { XATO_SINFI } from "./javob-ohangi";
```

Edit 2, old:

```tsx
          natija != null && !natija.isCorrect && "border-danger bg-danger/10 text-danger",
```

new:

```tsx
          natija != null && !natija.isCorrect && XATO_SINFI,
```

`L/uebung/yigish.tsx` — Edit 1, old:

```tsx
import type { PruefErgebnis } from "../types";
```

new:

```tsx
import type { PruefErgebnis } from "../types";
import { XATO_FONI, XATO_SINFI } from "./javob-ohangi";
```

Edit 2, old:

```tsx
          natija != null && !natija.isCorrect && "border-danger bg-danger/10 text-danger",
```

new:

```tsx
          natija != null && !natija.isCorrect && XATO_SINFI,
```

Edit 3, old:

```tsx
                      natija.isCorrect ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
```

new:

```tsx
                      natija.isCorrect ? "bg-success/10 text-success" : XATO_FONI,
```

Edit 4, old:

```tsx
    case "xato":
      return "border-danger bg-danger/10 text-danger";
```

new:

```tsx
    case "xato":
      return XATO_SINFI;
```

- [ ] **Step 5: The panel's words and look**

`L/uebung/natija-xabari.ts` — Edit 1, old:

```ts
 * picture without knowing the word yet. A typed word one slip away counts
 * as correct (`tippfehler`) and shows the spelling to learn.
 */
```

new:

```ts
 * picture without knowing the word yet. A typed word one slip away counts
 * as correct (`tippfehler`) and shows the spelling to learn. A wrong answer
 * is the soft «almost» with the answer to learn (ADR-0128), never a verdict.
 */
```

Edit 2, old:

```ts
  if (!natija.isCorrect) {
    return { sarlavha: t("Noto'g'ri"), izoh: null, soz: natija.loesungWort ?? natija.richtig };
  }
```

new:

```ts
  if (!natija.isCorrect) {
    const soz = natija.loesungWort ?? natija.richtig;
    return { sarlavha: t("Deyarli!"), izoh: soz ? t("To'g'ri javob:") : null, soz };
  }
```

`L/uebung/javob-paneli.tsx` — butun fayl (Write):

```tsx
"use client";

import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { DeWort } from "./de-wort";
import { XATO_SARLAVHASI } from "./javob-ohangi";
import { javobPaneliMatni } from "./natija-xabari";

/**
 * The verdict under a checked question, for every format but the pairing
 * ones. What it says comes from `javobPaneliMatni`; the tint is the bottom
 * bar's own (`PastkiPanel` `ohang`), so this draws only the words.
 */
export function JavobPaneli({ natija }: { natija: PruefErgebnis }) {
  const t = useT();
  const { sarlavha, izoh, soz } = javobPaneliMatni(natija, t);
  return (
    <div>
      <p
        className={cn(
          "font-display text-lg font-extrabold",
          natija.isCorrect ? "text-success" : XATO_SARLAVHASI,
        )}
      >
        {sarlavha}
      </p>
      {soz ? (
        <p className="mt-0.5 text-sm font-semibold text-ink-800">
          {izoh ? <span className="mr-1 text-ink-500">{izoh}</span> : null}
          <DeWort text={soz} />
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Dictionaries — add «Deyarli!», drop «Noto'g'ri»**

`grep -n "\"Deyarli!\"" client/src/i18n/dictionaries/ru.ts` — bo'sh bo'lishi kerak (kalit yo'q). `"To'g'ri javob:"` allaqachon bor (`media-fragen-panel.tsx` ham ishlatadi, ma'nosi bir xil) — qo'shilmaydi.

`client/src/i18n/dictionaries/ru.ts` — Edit 1, old:

```ts
  "Noto'g'ri": "Неверно",
  "To'g'ri!": "Верно!",
```

new:

```ts
  "To'g'ri!": "Верно!",
```

Edit 2, old:

```ts
};

export default ru;
```

new:

```ts
  "Deyarli!": "Почти!",
};

export default ru;
```

`client/src/i18n/dictionaries/de.ts` — Edit 1, old:

```ts
  "Noto'g'ri": "Falsch",
  "To'g'ri!": "Richtig!",
```

new:

```ts
  "To'g'ri!": "Richtig!",
```

Edit 2, old:

```ts
};

export default de;
```

new:

```ts
  "Deyarli!": "Fast!",
};

export default de;
```

`client/src/i18n/dictionaries/en.ts` — Edit 1, old:

```ts
  "Noto'g'ri": "Wrong",
  "To'g'ri!": "Correct!",
```

new:

```ts
  "To'g'ri!": "Correct!",
```

Edit 2, old:

```ts
};

export default en;
```

new:

```ts
  "Deyarli!": "Almost!",
};

export default en;
```

Tekshiring: `grep -rn "Noto'g'ri\"" client/src --include='*.ts' --include='*.tsx' | grep -v test` — natija bo'sh (boshqa joyda ishlatilmagan; `uz-cyrl.ts` da ham yo'q).

- [ ] **Step 7: Run the tests, the i18n check and lint**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung`
Expected: PASS (jumladan `javob-ohangi`, `natija-xabari`, `pastki-panel`, `juft-*`).

Run: `cd client && npm run i18n:check`
Expected: PASS («unused key» va «is missing» yo'q).

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/uebung`
Expected: tsc 0 xato; eslint `0 errors`.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/student-portal/lernen/uebung client/src/i18n/dictionaries/ru.ts client/src/i18n/dictionaries/de.ts client/src/i18n/dictionaries/en.ts
git commit -m "feat(lernen): a wrong answer is the soft amber «Deyarli!», never red

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — pastki panel tusi va mashq ilgarilash chizig'i

**Files:**
- Create: `L/uebung/seans-chizigi.tsx`
- Test: `L/uebung/seans-chizigi.test.ts`
- Modify: `L/uebung/pastki-panel.tsx`, `L/uebung/pastki-panel.test.ts`

**Interfaces:**
- Consumes: `CONTENT_INSET`, `type SidebarMode` (`../../lib/sidebar-store`); `cn`.
- Produces:
  - `PastkiPanel` props: `{ sidebarMode: SidebarMode; ohang?: "togri" | "xato" | null; children }` — `ohang` Task 1 dagi `panelOhangi(...)` qaytaradigan qiymat bilan bir xil union.
  - `chiziqFoizi(tugatilgan: number, jami: number): number` (0–100).
  - `<SeansChizigi tugatilgan={number} jami={number} className?={string} />`.
  - Ikkalasi ham o'tishni `motion-reduce:transition-none in-data-[kam-harakat]:transition-none` bilan to'xtatadi (seans ildizidagi `data-kam-harakat` ni Task 5 qo'yadi).

- [ ] **Step 1: Write the failing tests**

`L/uebung/seans-chizigi.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeansChizigi, chiziqFoizi } from "./seans-chizigi";

describe("chiziqFoizi", () => {
  it("is the share of the questions done, in percent", () => {
    expect(chiziqFoizi(3, 12)).toBe(25);
    expect(chiziqFoizi(12, 12)).toBe(100);
  });
  it("never leaves 0–100 and survives an empty session", () => {
    expect(chiziqFoizi(0, 0)).toBe(0);
    expect(chiziqFoizi(5, 4)).toBe(100);
    expect(chiziqFoizi(-1, 4)).toBe(0);
  });
});

describe("<SeansChizigi />", () => {
  const html = renderToStaticMarkup(createElement(SeansChizigi, { tugatilgan: 3, jami: 12 }));

  it("fills the bar to the share done", () => {
    expect(html).toContain("width:25%");
  });

  it("eases with a small overshoot, and jumps instead under reduced motion or the device switch", () => {
    expect(html).toContain("ease-[cubic-bezier(.3,1.2,.4,1)]");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain("in-data-[kam-harakat]:transition-none");
  });
});
```

`L/uebung/pastki-panel.test.ts` — faylning OXIRIGA qo'shing:

```ts
/** Classes of the painted inner layer. */
function innerClasses(ohang?: "togri" | "xato" | null): string {
  const html = renderToStaticMarkup(
    createElement(PastkiPanel, { sidebarMode: "auto", ohang }, "Tekshirish"),
  );
  return html.match(/^<div class="[^"]*"><div class="([^"]*)"/)?.[1] ?? "";
}

describe("the bar's tint after a check (ADR-0128)", () => {
  it("is the plain surface before the check", () => {
    expect(innerClasses()).toContain("bg-surface");
    expect(innerClasses(null)).toContain("bg-surface");
  });

  it("is a soft green after a right answer", () => {
    expect(innerClasses("togri")).toContain("var(--success)");
  });

  it("is the soft amber after a miss, never red", () => {
    const c = innerClasses("xato");
    expect(c).toContain("var(--amber-500)");
    expect(c).not.toContain("danger");
  });

  it("stops fading under reduced motion and the device switch", () => {
    expect(innerClasses("xato")).toContain("motion-reduce:transition-none");
    expect(innerClasses("xato")).toContain("in-data-[kam-harakat]:transition-none");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/seans-chizigi.test.ts src/components/student-portal/lernen/uebung/pastki-panel.test.ts`
Expected: FAIL — `./seans-chizigi` topilmadi; `pastki-panel` da `var(--success)` / `var(--amber-500)` yo'q.

- [ ] **Step 3: Implement the bar**

`L/uebung/seans-chizigi.tsx`:

```tsx
import { cn } from "@/lib/utils";

/**
 * Share of the session's questions done, 0–100. The bar takes a percent, not
 * a fraction: 4 of 12 done is 33 %, not 4 %.
 */
export function chiziqFoizi(tugatilgan: number, jami: number): number {
  if (jami <= 0) return 0;
  return Math.max(0, Math.min(100, (tugatilgan / jami) * 100));
}

/**
 * The exercise header's progress bar (duo.html `.pb`): 16 px, coral, a light
 * gloss stripe, and a fill that eases with a small overshoot (the track clips
 * it). Under reduced motion — the system's, or the device's «Kam harakat»
 * that the session root marks with `data-kam-harakat` — the fill jumps.
 */
export function SeansChizigi({
  tugatilgan,
  jami,
  className,
}: {
  tugatilgan: number;
  jami: number;
  className?: string;
}) {
  return (
    <div className={cn("inset-well h-4 overflow-hidden rounded-pill bg-sunk", className)}>
      <span
        className={cn(
          "relative block h-full overflow-hidden rounded-pill bg-coral-500",
          "transition-[width] duration-500 ease-[cubic-bezier(.3,1.2,.4,1)]",
          "motion-reduce:transition-none in-data-[kam-harakat]:transition-none",
        )}
        style={{ width: `${chiziqFoizi(tugatilgan, jami)}%` }}
      >
        <span aria-hidden className="absolute inset-x-2 top-1 h-1 rounded-pill bg-white/25" />
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Implement the panel tint**

`L/uebung/pastki-panel.tsx` — butun fayl (Write):

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CONTENT_INSET, type SidebarMode } from "../../lib/sidebar-store";

/**
 * The bar's own paint: the plain surface before the check, then a soft green
 * or the soft amber «almost» (ADR-0128) mixed INTO the surface, so the bar
 * stays opaque over the question it covers.
 */
const FON = {
  bosh: "bg-surface",
  togri: "bg-[color-mix(in_srgb,var(--success)_14%,var(--surface-card))]",
  xato: "bg-[color-mix(in_srgb,var(--amber-500)_16%,var(--surface-card))]",
} as const;

/**
 * A session's fixed bottom bar: the verdict and «Tekshirish»/«Keyingi».
 *
 * `fixed` takes the bar out of the content column, so on its own it spans the
 * whole viewport and, from md up, slides under the side rail. The outer layer
 * therefore carries the shell's own CONTENT_INSET: the painted bar starts where
 * the rail ends and is centred on the same column as the question, for either
 * rail width and for the pre-hydration `auto` mode. Below md there is no rail
 * and no inset, so a phone keeps the full-width bar.
 *
 * The mode is a prop, not read from `useSidebar` here, so a test can render the
 * wiring for every mode (a server render only ever sees the store's `auto`).
 * `ohang` is the verdict's tint (`panelOhangi`), `null` before the check.
 */
export function PastkiPanel({
  sidebarMode,
  ohang = null,
  children,
}: React.PropsWithChildren<{
  sidebarMode: SidebarMode;
  ohang?: "togri" | "xato" | null;
}>) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 transition-[padding] duration-200 ease-out",
        CONTENT_INSET[sidebarMode],
      )}
    >
      <div
        className={cn(
          "border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
          "transition-colors duration-200 motion-reduce:transition-none in-data-[kam-harakat]:transition-none",
          FON[ohang ?? "bosh"],
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/seans-chizigi.test.ts src/components/student-portal/lernen/uebung/pastki-panel.test.ts`
Expected: PASS (eski inset testlari ham).

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/uebung`
Expected: 0 xato.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/uebung/seans-chizigi.tsx client/src/components/student-portal/lernen/uebung/seans-chizigi.test.ts client/src/components/student-portal/lernen/uebung/pastki-panel.tsx client/src/components/student-portal/lernen/uebung/pastki-panel.test.ts
git commit -m "feat(lernen): tinted verdict bar and an overshooting progress bar for the exercise

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — seansda javob ovozi va Dafi (seans-ekrani yelimi)

**Files:**
- Create: `L/uebung/use-javob-sezgisi.ts`
- Modify: `L/dafi/dafi.tsx` (`tetik` prop)
- Modify: `L/uebung/seans-ekrani.tsx` (faqat yelim — quyidagi aniq Edit'lar)

**Interfaces:**
- Consumes: `javobEffekti(isCorrect)`, `panelOhangi(natija, juftlash)` (Task 1); `PastkiPanel ohang`, `SeansChizigi` (Task 4); `ovozChal(hodisa)`, `ovozniUygot()` (`L/ovoz/ovoz.ts`); `useKamHarakat()` (`L/harakat/use-kam-harakat.ts`); `Dafi`, `type DafiHolat`.
- Produces:
  - `DafiProps.tetik?: number` — o'zgarsa, xuddi shu holat qayta o'ynaladi (effekt bog'liqligi `[holat, tetik]`).
  - `useJavobSezgisi(): { dafi: { holat: DafiHolat; tetik: number }; javobKeldi: (isCorrect: boolean) => void; yangiSavol: () => void }` — `javobKeldi` ovozni chaladi va Dafi'ni o'zgartiradi (`tetik` har hukmda +1); `yangiSavol` Dafi'ni «o'ylayapti» ga qaytaradi; hook ovoz motori chunk'ini oldindan yuklaydi.
  - Seans ildizida `data-kam-harakat` (Task 4 sinflari shunga tayanadi).

> Bu task'da node testi yo'q: o'zgarish hook va effektlar (DOM'siz vitest ularni yurgizmaydi). RED/GREEN — TypeScript kompilyatori; xulq Task 10 ro'yxatida brauzerda tekshiriladi. Sof qarorlar Task 1 da testlangan.

- [ ] **Step 1: Wire the session (call sites first)**

`L/uebung/seans-ekrani.tsx` — quyidagi Edit'lar, tartib bilan. Oraliqdagi o'zgarmagan qatorlarning chekinishi qanday bo'lsa shunday qoladi (`client/` da Prettier yo'q).

Edit 1 (lumio importi), old:

```tsx
import { Button, EmptyState, LoadingCards, ProgressBar } from "../../lumio";
```

new:

```tsx
import { Button, EmptyState, LoadingCards } from "../../lumio";
```

Edit 2, old:

```tsx
import { kamHarakatHozir } from "../harakat/kam-harakat";
```

new:

```tsx
import { kamHarakatHozir } from "../harakat/kam-harakat";
import { useKamHarakat } from "../harakat/use-kam-harakat";
import { Dafi } from "../dafi/dafi";
import { ovozniUygot } from "../ovoz/ovoz";
```

Edit 3, old:

```tsx
import { PastkiPanel } from "./pastki-panel";
```

new:

```tsx
import { PastkiPanel } from "./pastki-panel";
import { panelOhangi } from "./hissiyot";
import { SeansChizigi } from "./seans-chizigi";
import { useJavobSezgisi } from "./use-javob-sezgisi";
```

Edit 4 (hooklar — erta `return` lardan oldin), old:

```tsx
  const wiederholungAbschluss = useWiederholungAbschluss();
```

new:

```tsx
  const wiederholungAbschluss = useWiederholungAbschluss();
  // The verdict's sound and Dafi's reaction (ADR-0128). Fired from the
  // mutation callbacks below, never from an effect on `natija`: the pairing
  // formats set a made-up final `natija` that must stay silent.
  const sezgi = useJavobSezgisi();
  const kam = useKamHarakat();
```

Edit 5 (`tekshir` — bosishning o'zida uyg'otish), old:

```tsx
    if (frage.format === "PAAR" || frage.format === "ZUORDNEN") return;
    pruefen.mutate(
```

new:

```tsx
    if (frage.format === "PAAR" || frage.format === "ZUORDNEN") return;
    // Inside the tap (and the Enter key): iOS and Telegram let audio start only
    // here, and the verdict sound comes later, from the answer.
    ovozniUygot();
    pruefen.mutate(
```

Edit 6 (`pruefen` hukmi), old:

```tsx
      { onSuccess: setNatija },
```

new:

```tsx
      {
        onSuccess: (javob) => {
          setNatija(javob);
          sezgi.javobKeldi(javob.isCorrect);
        },
      },
```

Edit 7 (`onJuft` — bosishning o'zida uyg'otish), old:

```tsx
    const { chapUstun, ongUstun } = juftUstunlar(frage.options, format);
    juftTekshir.mutate(
```

new:

```tsx
    const { chapUstun, ongUstun } = juftUstunlar(frage.options, format);
    ovozniUygot();
    juftTekshir.mutate(
```

Edit 8 (har juftning hukmi — juft uchun ovoz), old:

```tsx
          setJuftlar(
            (prev) =>
              juftJavobKeldi(prev, chapIdx, ongIdx, javob.isCorrect).juftlar,
          );
```

new:

```tsx
          setJuftlar(
            (prev) =>
              juftJavobKeldi(prev, chapIdx, ongIdx, javob.isCorrect).juftlar,
          );
          // One sound and one Dafi reaction per pair (the final made-up
          // `natija` of the board stays silent).
          sezgi.javobKeldi(javob.isCorrect);
```

Edit 9 (`keyingi` — yangi savolda Dafi o'ylaydi), old:

```tsx
    setHolat(keyingiHolat);
    setNatija(null);
```

new:

```tsx
    setHolat(keyingiHolat);
    setNatija(null);
    sezgi.yangiSavol();
```

Edit 10 (`qaytaOtish`), old:

```tsx
    setHolat(boshla(data));
    setNatija(null);
```

new:

```tsx
    setHolat(boshla(data));
    setNatija(null);
    sezgi.yangiSavol();
```

Edit 11 (savol ko'rinishining ildizi), old:

```tsx
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-40 pt-4">
```

new:

```tsx
  return (
    <div
      // Less motion (device switch or system): the progress fill and the bar's tint stop sliding.
      data-kam-harakat={kam ? "" : undefined}
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-40 pt-4"
    >
```

Edit 12 (sarlavhadagi chiziq), old:

```tsx
        {/* Lumio `ProgressBar` FOIZ oladi (0–100), kasr emas — `value`ga
            `tugatilgan`ni bersak, 12 dan 4 chizig'ning 4 % ini bo'yardi. */}
        <ProgressBar
          value={holat.jami ? (holat.tugatilgan / holat.jami) * 100 : 0}
          className="flex-1"
        />
```

new:

```tsx
        <SeansChizigi
          tugatilgan={holat.tugatilgan}
          jami={holat.jami}
          className="flex-1"
        />
```

Edit 13 (pastki panel boshi — tus va Dafi), old:

```tsx
      <PastkiPanel sidebarMode={sidebarMode}>
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          {natija ? (
            juftlashRejimi ? (
              natija.isCorrect ? (
                <div className="rounded-2xl bg-success/10 px-4 py-3">
                  <p className="font-bold text-success">{t("To'g'ri!")}</p>
                </div>
              ) : (
```

new:

```tsx
      <PastkiPanel
        sidebarMode={sidebarMode}
        ohang={panelOhangi(natija, juftlashRejimi)}
      >
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          {/* Dafi stays for the whole session: he thinks over each question,
              then cheers or takes the soft miss with every verdict. */}
          <div className="flex items-center gap-3">
            <Dafi
              holat={sezgi.dafi.holat}
              tetik={sezgi.dafi.tetik}
              olcham="sm"
            />
            <div className="min-w-0 flex-1">
          {natija ? (
            juftlashRejimi ? (
              natija.isCorrect ? (
                <p className="font-display text-lg font-extrabold text-success">
                  {t("To'g'ri!")}
                </p>
              ) : (
```

Edit 14 (pastki panel — ikki `div` ni yopish), old:

```tsx
          ) : yuborishXato ? (
            <p className="text-sm font-semibold text-danger">
              {t("Yuborib bo'lmadi. Qayta urinib ko'ring")}
            </p>
          ) : null}
          {juftlashRejimi ? (
```

new:

```tsx
          ) : yuborishXato ? (
            <p className="text-sm font-semibold text-danger">
              {t("Yuborib bo'lmadi. Qayta urinib ko'ring")}
            </p>
          ) : null}
            </div>
          </div>
          {juftlashRejimi ? (
```

(«Yuborib bo'lmadi» — tarmoq xatosi, xato javob emas: `text-danger` qoladi, ovoz yo'q.)

- [ ] **Step 2: Run the type check to see it fail**

Run: `cd client && npx tsc --noEmit`
Expected: FAIL — `Cannot find module './use-javob-sezgisi'` va `Property 'tetik' does not exist on type 'IntrinsicAttributes & DafiProps'`.

- [ ] **Step 3: Let Dafi replay the same state**

`L/dafi/dafi.tsx` — Edit 1, old:

```tsx
export interface DafiProps {
  holat?: DafiHolat;
  olcham?: DafiOlcham;
  className?: string;
}
```

new:

```tsx
export interface DafiProps {
  holat?: DafiHolat;
  olcham?: DafiOlcham;
  /**
   * Change it to play the same state again: two right answers in a row (or
   * two right pairs) must cheer twice, though `holat` stays «bayram».
   */
  tetik?: number;
  className?: string;
}
```

Edit 2, old:

```tsx
export function Dafi({ holat = "tinch", olcham = "md", className }: DafiProps) {
```

new:

```tsx
export function Dafi({ holat = "tinch", olcham = "md", tetik, className }: DafiProps) {
```

Edit 3, old:

```tsx
  React.useEffect(() => {
    hozirgi.current = holat;
    rig.current?.set(RIG_HOLAT[holat]);
  }, [holat]);
```

new:

```tsx
  React.useEffect(() => {
    hozirgi.current = holat;
    rig.current?.set(RIG_HOLAT[holat]);
  }, [holat, tetik]);
```

- [ ] **Step 4: Write the session hook**

`L/uebung/use-javob-sezgisi.ts`:

```ts
"use client";

import * as React from "react";
import type { DafiHolat } from "../dafi/dafi-holat";
import { ovozChal } from "../ovoz/ovoz";
import { javobEffekti } from "./hissiyot";

export interface SeansDafi {
  holat: DafiHolat;
  /** Counts the verdicts, so the same state replays (`Dafi` `tetik`). */
  tetik: number;
}

/**
 * The exercise screen's feedback (ADR-0128): the verdict's sound and Dafi's
 * reaction. `javobKeldi` is called from the check's mutation callbacks, once
 * per verdict and once per pair; never from an effect and never on a network
 * error. `yangiSavol` puts Dafi back to thinking for the next question.
 */
export function useJavobSezgisi(): {
  dafi: SeansDafi;
  javobKeldi: (isCorrect: boolean) => void;
  yangiSavol: () => void;
} {
  const [dafi, setDafi] = React.useState<SeansDafi>({ holat: "oylayapti", tetik: 0 });

  // The sound engine is its own chunk and a session opens by URL too: load it
  // now, so on iOS/Telegram the unlock finds it ready inside the first tap.
  React.useEffect(() => {
    import("../ovoz/ovoz-motor").catch(() => {});
  }, []);

  const javobKeldi = React.useCallback((isCorrect: boolean) => {
    const e = javobEffekti(isCorrect);
    ovozChal(e.ovoz);
    setDafi((d) => ({ holat: e.dafi, tetik: d.tetik + 1 }));
  }, []);

  const yangiSavol = React.useCallback(() => {
    setDafi((d) => ({ holat: "oylayapti", tetik: d.tetik }));
  }, []);

  return { dafi, javobKeldi, yangiSavol };
}
```

- [ ] **Step 5: Type check, tests, lint**

Run: `cd client && npx tsc --noEmit`
Expected: 0 xato.

Run: `cd client && npx vitest run src/components/student-portal/lernen`
Expected: PASS (jumladan `dafi.test.ts`, `seans-navbat.test.ts`, `fortschritt.test.ts` — o'zgarmagan).

Run: `cd client && npx eslint src/components/student-portal/lernen`
Expected: `0 errors` (yangi ogohlantirish qo'shilmagan bo'lsin; `seans-ekrani.tsx` dagi mavjud `eslint-disable-next-line react-hooks/exhaustive-deps` qatorlari joyida).

Run: `git diff --stat -- client/src/components/student-portal/lernen/seans-navbat.ts client/src/components/student-portal/lernen/fortschritt.ts`
Expected: bo'sh (holat mashinasi tegilmagan).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/dafi/dafi.tsx client/src/components/student-portal/lernen/uebung/use-javob-sezgisi.ts client/src/components/student-portal/lernen/uebung/seans-ekrani.tsx
git commit -m "feat(lernen): verdict sounds and Dafi in the exercise, from the check callbacks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — konfeti (sof fizika + canvas)

**Files:**
- Create: `L/uebung/konfeti.ts`, `L/uebung/konfeti-tuval.tsx`
- Test: `L/uebung/konfeti.test.ts`, `L/uebung/konfeti-tuval.test.ts`

**Interfaces:**
- Consumes: `kamHarakatHozir()` (`L/harakat/kam-harakat.ts`).
- Produces:
  - `interface Zarra { x: number; y: number; vx: number; vy: number; r: number; rang: string; a: number }`
  - `KONFETI_RANGLARI` (5 ta hex), `KONFETI_SONI = 100`, `KONFETI_KADRLARI = 120`, `OGIRLIK = 0.42`
  - `konfetiYarat(x: number, y: number, rnd?: () => number): Zarra[]`, `konfetiQadam(zarralar: Zarra[]): void`
  - `<KonfetiTuval />` — o'rnatilganda bir marta otiladi (butun ekran, `fixed inset-0`, `pointer-events-none`), kam harakatda hech narsa chizmaydi. Task 8 uni `hissiyot.bayram` bo'lganda o'rnatadi.

- [ ] **Step 1: Write the failing tests**

`L/uebung/konfeti.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KONFETI_RANGLARI, KONFETI_SONI, OGIRLIK, konfetiQadam, konfetiYarat } from "./konfeti";

const sobit = (v: number) => () => v;

/** A fixed pseudo-random sequence, so the test sees the same burst every run. */
function urug() {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe("konfetiYarat", () => {
  it("throws a hundred pieces from one point, upwards", () => {
    const zarralar = konfetiYarat(180, 330, sobit(0.5));
    expect(zarralar).toHaveLength(KONFETI_SONI);
    for (const z of zarralar) {
      expect([z.x, z.y]).toEqual([180, 330]);
      expect(z.vy).toBeLessThan(0);
    }
  });

  it("keeps every speed and size inside the mockup's ranges, at both ends of the random scale", () => {
    for (const r of [0, 0.999999]) {
      for (const z of konfetiYarat(0, 0, sobit(r))) {
        expect(z.vx).toBeGreaterThanOrEqual(-7);
        expect(z.vx).toBeLessThanOrEqual(7);
        expect(z.vy).toBeGreaterThanOrEqual(-14);
        expect(z.vy).toBeLessThanOrEqual(-3);
        expect(z.r).toBeGreaterThanOrEqual(4);
        expect(z.r).toBeLessThanOrEqual(8);
        expect(KONFETI_RANGLARI).toContain(z.rang);
      }
    }
  });

  it("uses all five colours of the palette", () => {
    const ranglar = new Set(konfetiYarat(0, 0, urug()).map((z) => z.rang));
    expect(ranglar.size).toBe(KONFETI_RANGLARI.length);
  });
});

describe("konfetiQadam", () => {
  it("moves every piece by its speed, then gravity slows it on the way up", () => {
    const [z] = konfetiYarat(100, 200, sobit(0.5));
    const { x, y, vx, vy, a } = z;
    konfetiQadam([z]);
    expect(z.x).toBeCloseTo(x + vx);
    expect(z.y).toBeCloseTo(y + vy);
    expect(z.vy).toBeCloseTo(vy + OGIRLIK);
    expect(z.a).toBeCloseTo(a + 0.2);
  });
});
```

`L/uebung/konfeti-tuval.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KonfetiTuval } from "./konfeti-tuval";

describe("<KonfetiTuval />", () => {
  it("is a full-screen canvas that never catches a tap and is hidden from screen readers", () => {
    const html = renderToStaticMarkup(createElement(KonfetiTuval));
    expect(html).toContain("<canvas");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("fixed inset-0");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/konfeti.test.ts src/components/student-portal/lernen/uebung/konfeti-tuval.test.ts`
Expected: FAIL — modullar topilmadi.

- [ ] **Step 3: Implement the physics**

`L/uebung/konfeti.ts`:

```ts
/** One piece of confetti: a small rotating rectangle. */
export interface Zarra {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the long side, px. */
  r: number;
  rang: string;
  /** Rotation, radians. */
  a: number;
}

/** Lumio's coral, amber, teal, grape and sky — canvas cannot read CSS variables. */
export const KONFETI_RANGLARI = ["#ff6b4a", "#ffc24d", "#14b8ac", "#8b5cf6", "#5bb1ff"] as const;
export const KONFETI_SONI = 100;
/** About 2 s at 60 fps (duo.html `confetti()`). */
export const KONFETI_KADRLARI = 120;
export const OGIRLIK = 0.42;

/** A burst from one point: speeds and sizes are duo.html's. `rnd` is injectable for tests. */
export function konfetiYarat(x: number, y: number, rnd: () => number = Math.random): Zarra[] {
  const oraliq = (a: number, b: number) => a + rnd() * (b - a);
  return Array.from({ length: KONFETI_SONI }, () => ({
    x,
    y,
    vx: oraliq(-7, 7),
    vy: oraliq(-14, -3),
    r: oraliq(4, 8),
    rang: KONFETI_RANGLARI[Math.min(KONFETI_RANGLARI.length - 1, Math.floor(rnd() * KONFETI_RANGLARI.length))],
    a: oraliq(0, 6),
  }));
}

/** One frame, in place: move, then let gravity pull and the piece spin. */
export function konfetiQadam(zarralar: Zarra[]): void {
  for (const z of zarralar) {
    z.x += z.vx;
    z.y += z.vy;
    z.vy += OGIRLIK;
    z.a += 0.2;
  }
}
```

- [ ] **Step 4: Implement the canvas**

`L/uebung/konfeti-tuval.tsx`:

```tsx
"use client";

import * as React from "react";
import { kamHarakatHozir } from "../harakat/kam-harakat";
import { KONFETI_KADRLARI, konfetiQadam, konfetiYarat } from "./konfeti";

/**
 * One burst of confetti over the whole screen, then the canvas is cleared.
 * Never under less motion (system or the device's «Kam harakat»). A remount —
 * React StrictMode's second effect run included — simply throws a fresh burst;
 * the reward sound is not here, so it cannot repeat with it.
 */
export function KonfetiTuval() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const tuval = ref.current;
    if (!tuval || kamHarakatHozir()) return;
    const ctx = tuval.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = tuval.clientWidth;
    const h = tuval.clientHeight;
    tuval.width = Math.round(w * dpr);
    tuval.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const zarralar = konfetiYarat(w / 2, h * 0.45);
    let kadr = 0;
    let id = 0;
    const chiz = () => {
      ctx.clearRect(0, 0, w, h);
      konfetiQadam(zarralar);
      for (const z of zarralar) {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.rotate(z.a);
        ctx.fillStyle = z.rang;
        ctx.fillRect(-z.r, -z.r / 2, z.r * 2, z.r);
        ctx.restore();
      }
      kadr += 1;
      if (kadr < KONFETI_KADRLARI) id = requestAnimationFrame(chiz);
      else ctx.clearRect(0, 0, w, h);
    };
    id = requestAnimationFrame(chiz);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 size-full"
    />
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/konfeti.test.ts src/components/student-portal/lernen/uebung/konfeti-tuval.test.ts`
Expected: PASS.

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/uebung`
Expected: 0 xato.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/uebung/konfeti.ts client/src/components/student-portal/lernen/uebung/konfeti.test.ts client/src/components/student-portal/lernen/uebung/konfeti-tuval.tsx client/src/components/student-portal/lernen/uebung/konfeti-tuval.test.ts
git commit -m "feat(lernen): confetti burst for the lesson reward (pure physics, canvas, off under less motion)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — tema shartnomasiga `MukofotFoni` va `UnitLavha`

**Files:**
- Modify: `L/tema/tema-turlari.ts`, `L/tema/toza/toza-tema.ts`, `L/tema/tema-reyestri.test.ts`, `L/yol/yopishqoq-unit-lavha.tsx`
- Create: `L/tema/toza/toza-mukofot-foni.tsx`, `L/tema/toza/toza-unit-lavha.tsx`
- Test: `L/tema/toza/toza-orinlar.test.ts`

**Interfaces:**
- Consumes: `Dafi` (`L/dafi/dafi.tsx`); `type DafLevel` (`L/types.ts`); `TEMALAR`, `temaTop` (`L/tema/tema-reyestri.ts`).
- Produces:
  - `interface MukofotFoniProps { bayram: boolean; children: React.ReactNode }`
  - `interface UnitLavhaProps { daraja: DafLevel; matn: string }`
  - `LernenTema = { id; TugunBelgisi; MukofotFoni: React.ComponentType<MukofotFoniProps>; UnitLavha: React.ComponentType<UnitLavhaProps> }`
  - `TozaMukofotFoni`, `TozaUnitLavha`; `tozaTema` ikkalasini beradi.
  - `DARAJA_FONI: Record<string, string>` (`L/yol/yopishqoq-unit-lavha.tsx` dan eksport; `A1 → bg-coral-500`, `A2 → bg-teal-500`, `B1 → bg-grape-500`).
  - Task 8 `<tema.MukofotFoni bayram>` ni, Task 9 `<tema.UnitLavha daraja matn>` ni chizadi.

- [ ] **Step 1: Write the failing tests**

`L/tema/tema-reyestri.test.ts` — Edit, old:

```ts
  it("draws the default for a look that is not built yet", () => {
```

new:

```ts
  it("every finished theme draws the result background and the unit header (ADR-0128)", () => {
    for (const tema of Object.values(TEMALAR)) {
      expect(tema?.MukofotFoni, `${tema?.id}: MukofotFoni`).toBeTruthy();
      expect(tema?.UnitLavha, `${tema?.id}: UnitLavha`).toBeTruthy();
    }
  });
  it("draws the default for a look that is not built yet", () => {
```

`L/tema/toza/toza-orinlar.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TozaMukofotFoni } from "./toza-mukofot-foni";
import { TozaUnitLavha } from "./toza-unit-lavha";

describe("<TozaMukofotFoni />", () => {
  it("is a plain coral tint around the reward, whatever the result", () => {
    for (const bayram of [true, false]) {
      // `children` goes in the props: `MukofotFoniProps` requires it, and `tsc` checks tests too.
      const html = renderToStaticMarkup(createElement(TozaMukofotFoni, { bayram, children: "Dars tugadi!" }));
      expect(html).toContain("Dars tugadi!");
      expect(html).toContain("bg-coral-500/10");
    }
  });
});

describe("<TozaUnitLavha />", () => {
  const html = renderToStaticMarkup(createElement(TozaUnitLavha, { daraja: "A2", matn: "A2 · Wohnen" }));

  it("is the path's level-coloured banner with the unit's line", () => {
    expect(html).toContain("A2 · Wohnen");
    expect(html).toContain("bg-teal-500");
  });

  it("is read by screen readers (unlike the sticky path banner) and Dafi waves hello", () => {
    expect(html).not.toMatch(/^<div[^>]*aria-hidden/);
    expect(html).toContain('data-holat="salom"');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema`
Expected: FAIL — `toza: MukofotFoni` `expected undefined to be truthy`; `./toza-mukofot-foni` topilmadi.

- [ ] **Step 3: Extend the contract**

`L/tema/tema-turlari.ts` — butun fayl (Write):

```ts
import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { DafLevel } from "../types";

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
}

/**
 * What a theme supplies to Ta'lim (ADR-0125, ADR-0128). A theme only DRAWS:
 * the path, locks, points, the exercise screen, the confetti and the
 * sound/Dafi decisions are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
  /** The result screen's background around Dafi, the heading and the cards. */
  MukofotFoni: React.ComponentType<MukofotFoniProps>;
  /** The unit page's header. */
  UnitLavha: React.ComponentType<UnitLavhaProps>;
}
```

- [ ] **Step 4: Share the level colours**

`L/yol/yopishqoq-unit-lavha.tsx` — Edit 1, old:

```tsx
/** Same level colours as the path (A1 coral, A2 teal, B1 grape). */
const FON: Record<string, string> = {
```

new:

```tsx
/** Same level colours as the path (A1 coral, A2 teal, B1 grape); the unit page's banner uses them too. */
export const DARAJA_FONI: Record<string, string> = {
```

Edit 2, old:

```tsx
        FON[daraja] ?? FON.A1,
```

new:

```tsx
        DARAJA_FONI[daraja] ?? DARAJA_FONI.A1,
```

- [ ] **Step 5: The «Toza» slots**

`L/tema/toza/toza-mukofot-foni.tsx`:

```tsx
import type { MukofotFoniProps } from "../tema-turlari";

/** «Toza»: a plain coral tint behind the reward; the celebration itself is theme-independent. */
export function TozaMukofotFoni({ children }: MukofotFoniProps) {
  return <div className="relative rounded-[28px] bg-coral-500/10 px-4 py-6">{children}</div>;
}
```

`L/tema/toza/toza-unit-lavha.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Dafi } from "../../dafi/dafi";
import { DARAJA_FONI } from "../../yol/yopishqoq-unit-lavha";
import type { UnitLavhaProps } from "../tema-turlari";

/**
 * «Toza»: the path's level-coloured banner at the top of the unit page, with
 * Dafi waving hello. Unlike the path's sticky banner it is the only place the
 * unit's German title is shown, so screen readers read it.
 */
export function TozaUnitLavha({ daraja, matn }: UnitLavhaProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl py-2 pl-4 pr-2 text-white shadow-[0_5px_0_rgba(0,0,0,.22)]",
        DARAJA_FONI[daraja] ?? DARAJA_FONI.A1,
      )}
    >
      <p className="min-w-0 flex-1 font-display text-base font-extrabold">{matn}</p>
      <Dafi holat="salom" olcham="sm" />
    </div>
  );
}
```

`L/tema/toza/toza-tema.ts` — butun fayl (Write):

```ts
import type { LernenTema } from "../tema-turlari";
import { TozaMukofotFoni } from "./toza-mukofot-foni";
import { TozaTugun } from "./toza-tugun";
import { TozaUnitLavha } from "./toza-unit-lavha";

export const tozaTema: LernenTema = {
  id: "toza",
  TugunBelgisi: TozaTugun,
  MukofotFoni: TozaMukofotFoni,
  UnitLavha: TozaUnitLavha,
};
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/tema src/components/student-portal/lernen/yol`
Expected: PASS (`yopishqoq-unit-lavha.test.ts` ham — `bg-teal-500` va boshqalar o'zgarmagan).

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen/tema src/components/student-portal/lernen/yol`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/student-portal/lernen/tema client/src/components/student-portal/lernen/yol/yopishqoq-unit-lavha.tsx
git commit -m "feat(lernen): theme slots for the reward background and the unit header (Toza)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — natija sahnasi (mukofot, konfeti, Dafi, uchta karta)

**Files:**
- Create: `L/uebung/sanoq.ts`, `L/uebung/natija-sahna.tsx`
- Test: `L/uebung/natija-sahna.test.ts`, `L/uebung/natija-ekrani.test.ts`
- Modify: `L/uebung/natija-ekrani.tsx` (butun fayl), `L/uebung/seans-ekrani.tsx` (bitta prop), `L/uebung/javob-ohangi.test.ts` (ro'yxat)
- Modify: `client/src/i18n/i18n-coverage.test.ts`, `client/src/i18n/dictionaries/{ru,de,en}.ts`

**Interfaces:**
- Consumes: `natijaHissiyoti`, `aniqlikFoizi`, `type NatijaHissiyoti` (Task 1); `<KonfetiTuval />` (Task 6); `useLernenTema().tema.MukofotFoni` (Task 7); `data-kam-harakat` CSS (Task 2); `JAVOB_FAYLLARI` (Task 3); `ovozChal("mukofot")`; `<Dafi holat olcham="lg" />`; `useKamHarakat()`.
- Produces:
  - `useSanaladiganBall(maqsad: number | null): number | null` (`sanoq.ts`, natija-ekrani'dan ko'chirildi, xulqi bir xil).
  - `interface NatijaSahnaProps { togri: number; jami: number; durationMs: number; ball: number | null; serie: number | null; hissiyot: NatijaHissiyoti; takrorlash?: boolean }`, `<NatijaSahna … />`.
  - `NatijaEkraniProps.takrorlash?: boolean`; `SeansEkrani` uni `takrorlash={!darsMi}` bilan beradi.
  - Lug'at: `"Dars tugadi!"`, `"Takrorlash tugadi!"`, `"Ball"`, `"Aniqlik"` qo'shiladi; ishlatilmay qolgan `"+{n} ball"` va `"seriya"` o'chiriladi (`"Seriya"` — bosh harfli, `musobaqa` ham ishlatadi — qoladi).

- [ ] **Step 1: Write the failing tests**

`L/uebung/natija-sahna.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NatijaSahna, type NatijaSahnaProps } from "./natija-sahna";

const asos: NatijaSahnaProps = {
  togri: 12,
  jami: 15,
  durationMs: 65_000,
  ball: null,
  serie: null,
  hissiyot: { bayram: true, dafi: "bayram" },
};

const render = (p: Partial<NatijaSahnaProps> = {}) =>
  renderToStaticMarkup(createElement(NatijaSahna, { ...asos, ...p }));
const matn = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("<NatijaSahna />", () => {
  it("says the lesson is done, with the score and the time", () => {
    const t = matn(render());
    expect(t).toContain("Dars tugadi!");
    expect(t).toContain("12 / 15 · 1:05");
  });

  it("a review says so", () => {
    expect(matn(render({ takrorlash: true }))).toContain("Takrorlash tugadi!");
  });

  it("shows points, accuracy and the streak as three cards", () => {
    const t = matn(render({ ball: 20, serie: 4 }));
    expect(t).toContain("Ball");
    expect(t).toContain("Aniqlik");
    expect(t).toContain("Seriya");
    expect(t).toContain("80%");
    expect(t).not.toContain("—");
  });

  it("draws a dash, not a zero, while the server has not answered", () => {
    expect(matn(render()).match(/—/g)).toHaveLength(2);
  });

  it("a celebration: Dafi cheers and the confetti is thrown", () => {
    const html = render();
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<canvas");
  });

  it("no celebration: Dafi takes the soft miss and nothing is thrown", () => {
    const html = render({ hissiyot: { bayram: false, dafi: "xato" } });
    expect(html).toContain('data-holat="xato"');
    expect(html).not.toContain("<canvas");
  });
});
```

`L/uebung/natija-ekrani.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/lernen/lessons/9",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { NatijaEkrani, type NatijaEkraniProps } from "./natija-ekrani";

const asos: NatijaEkraniProps = {
  togri: 12,
  jami: 15,
  durationMs: 65_000,
  xatolar: [],
  unitId: 7,
  onQayta: () => {},
  natija: null,
};

function render(p: Partial<NatijaEkraniProps> = {}): string {
  const client = new QueryClient();
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(NatijaEkrani, { ...asos, ...p })),
  );
}

const sinov = (bestanden: boolean) => ({
  tur: "tayyor" as const,
  natija: { bestanden, avvalOtilgan: false, togri: 12, jami: 15, kerak: 14 },
});

describe("<NatijaEkrani /> celebrates only what deserves it (ADR-0128)", () => {
  it("an ordinary lesson: the theme's reward background, Dafi cheers, confetti", () => {
    const html = render();
    expect(html).toContain("bg-coral-500/10");
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<canvas");
  });

  it("a final test the server has not decided yet: Dafi thinks, nothing is thrown", () => {
    const html = render({ sinov: { tur: "kutilmoqda" } });
    expect(html).toContain('data-holat="oylayapti"');
    expect(html).not.toContain("<canvas");
  });

  it("a failed final test: the soft miss, an amber card, no confetti and no red", () => {
    const html = render({ sinov: sinov(false) });
    expect(html).toContain('data-holat="xato"');
    expect(html).not.toContain("<canvas");
    expect(html).toContain("bg-amber-500/10");
    expect(html).not.toContain("danger");
  });

  it("a passed final test celebrates", () => {
    const html = render({ sinov: sinov(true) });
    expect(html).toContain('data-holat="bayram"');
    expect(html).toContain("<canvas");
  });

  it("a review says so", () => {
    expect(render({ takrorlash: true })).toContain("Takrorlash tugadi!");
  });
});
```

`L/uebung/javob-ohangi.test.ts` — Edit, old:

```ts
  "javob-paneli.tsx",
];
```

new:

```ts
  "javob-paneli.tsx",
  "natija-ekrani.tsx",
  "natija-sahna.tsx",
];
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung/natija-sahna.test.ts src/components/student-portal/lernen/uebung/natija-ekrani.test.ts src/components/student-portal/lernen/uebung/javob-ohangi.test.ts`
Expected: FAIL — `./natija-sahna` topilmadi; `natija-ekrani.tsx` da `text-danger` / `bg-danger/10` bor; `natija-ekrani.test.ts` da `data-holat` yo'q.

- [ ] **Step 3: Move the count-up out**

`L/uebung/sanoq.ts`:

```ts
"use client";

import * as React from "react";
import { kamHarakatHozir } from "../harakat/kam-harakat";

const SANOQ_DAVOMIYLIGI = 600;

/**
 * A value that counts up from zero to `maqsad` in about 600 ms
 * (`requestAnimationFrame`). Under less motion (system or the device's
 * switch) it shows the final value at once: the number matters, not its rise.
 * `null` until there is a target.
 */
export function useSanaladiganBall(maqsad: number | null): number | null {
  const [qiymat, setQiymat] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (maqsad == null) {
      setQiymat(null);
      return;
    }

    if (kamHarakatHozir() || maqsad === 0) {
      setQiymat(maqsad);
      return;
    }

    const boshi = performance.now();
    let frameId: number;

    const kadr = (hozir: number) => {
      const foiz = Math.min(1, (hozir - boshi) / SANOQ_DAVOMIYLIGI);
      setQiymat(Math.round(foiz * maqsad));
      if (foiz < 1) {
        frameId = requestAnimationFrame(kadr);
      }
    };
    frameId = requestAnimationFrame(kadr);
    return () => cancelAnimationFrame(frameId);
  }, [maqsad]);

  return qiymat;
}
```

- [ ] **Step 4: The result scene**

`L/uebung/natija-sahna.tsx`:

```tsx
"use client";

import * as React from "react";
import { CheckCircle, Fire, Star } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../dafi/dafi";
import { ovozChal } from "../ovoz/ovoz";
import { aniqlikFoizi, type NatijaHissiyoti } from "./hissiyot";
import { KonfetiTuval } from "./konfeti-tuval";
import { useSanaladiganBall } from "./sanoq";

/** `durationMs` as minutes:seconds — 65_000 → "1:05". */
function vaqtBelgisi(durationMs: number): string {
  const jamiSoniya = Math.round(durationMs / 1000);
  const daqiqa = Math.floor(jamiSoniya / 60);
  const soniya = jamiSoniya % 60;
  return `${daqiqa}:${String(soniya).padStart(2, "0")}`;
}

/** One of the three result cards (duo.html `.card`): a filled caption over the value. */
function Karta({ nom, qiymat, belgi }: { nom: string; qiymat: string; belgi: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-coral-500 bg-surface">
      <p className="bg-coral-500 px-1 py-1 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white">
        {nom}
      </p>
      <p className="flex items-center justify-center gap-1 px-1.5 py-2.5 font-display text-xl font-extrabold tabular-nums text-ink-900">
        {belgi}
        {qiymat}
      </p>
    </div>
  );
}

export interface NatijaSahnaProps {
  togri: number;
  jami: number;
  durationMs: number;
  /** The server's points; `null` until it answers (or when it never does). */
  ball: number | null;
  /** The server's streak in days; `null` until it answers. */
  serie: number | null;
  hissiyot: NatijaHissiyoti;
  /** A review session: the heading says «Takrorlash tugadi!». */
  takrorlash?: boolean;
}

/**
 * The top of the result screen (spec §9, duo.html `.res`): Dafi, the heading
 * and the points, accuracy and streak cards. When the result deserves it
 * (`hissiyot.bayram`) the reward sound plays ONCE — the ref outlives React
 * StrictMode's second effect run — and the confetti is thrown; Dafi's three
 * hops are his «bayram» state. Theme-independent: the theme only draws the
 * background around it (`LernenTema.MukofotFoni`).
 */
export function NatijaSahna({
  togri,
  jami,
  durationMs,
  ball,
  serie,
  hissiyot,
  takrorlash = false,
}: NatijaSahnaProps) {
  const t = useT();
  const sanaladigan = useSanaladiganBall(ball);
  const chalindi = React.useRef(false);

  React.useEffect(() => {
    if (!hissiyot.bayram || chalindi.current) return;
    chalindi.current = true;
    ovozChal("mukofot");
  }, [hissiyot.bayram]);

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Dafi holat={hissiyot.dafi} olcham="lg" />
      <div>
        <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink-900">
          {takrorlash ? t("Takrorlash tugadi!") : t("Dars tugadi!")}
        </h1>
        <p className="mt-1 font-semibold tabular-nums text-ink-500">
          {togri} / {jami} · {vaqtBelgisi(durationMs)}
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-3 gap-2.5">
        <Karta
          nom={t("Ball")}
          qiymat={ball == null ? "—" : `+${sanaladigan ?? 0}`}
          belgi={<Star size={18} weight="fill" className="text-amber-500" />}
        />
        <Karta
          nom={t("Aniqlik")}
          qiymat={`${aniqlikFoizi(togri, jami)}%`}
          belgi={<CheckCircle size={18} weight="fill" className="text-teal-500" />}
        />
        <Karta
          nom={t("Seriya")}
          qiymat={serie == null ? "—" : String(serie)}
          belgi={<Fire size={18} weight="fill" className="text-coral-500" />}
        />
      </div>
      {hissiyot.bayram ? <KonfetiTuval /> : null}
    </div>
  );
}
```

- [ ] **Step 5: Rebuild the result screen around the scene**

`L/uebung/natija-ekrani.tsx` — butun fayl (Write). `XatoQatori` va tugmalar mantig'i o'zgarmaydi; faqat to'g'ri javob rangi qizildan `text-ink-900` ga, sinov kartasining «xavf» ohangi ambarga, tepadagi karta `NatijaSahna` ga almashadi, ball/seriya chiplari kartalarga o'tadi:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { Button, Card, FadeIn } from "../../lumio";
import { useKamHarakat } from "../harakat/use-kam-harakat";
import type { SeansXato } from "../seans-navbat";
import { useLernenTema } from "../tema/use-lernen-tema";
import type { SeansNatijasi } from "../types";
import { natijaHissiyoti } from "./hissiyot";
import { natijaQatorlari, xatoYorligi } from "./natija-xabari";
import { NatijaSahna } from "./natija-sahna";
import { DeWort } from "./de-wort";
import { sinovKorinishi, type SinovHolati } from "./sinov-natijasi";

export interface NatijaEkraniProps {
  togri: number;
  jami: number;
  durationMs: number;
  xatolar: SeansXato[];
  unitId: number | null;
  onQayta: () => void;
  /** Server javobidagi seans natijasi; yo'q bo'lsa yutuqlar kartasi chizilmaydi. */
  natija: SeansNatijasi | null;
  /** Yakuniy sinov darsida — server qarori holati; oddiy darsda yo'q. */
  sinov?: SinovHolati | null;
  /** `sinov.tur === "xato"` bo'lganda natijani qayta yuborish. */
  onNatijaQaytaYubor?: () => void;
  /** A review session (it belongs to no lesson): the heading says so. */
  takrorlash?: boolean;
}

/**
 * Bitta xato satrini o'qish mumkin bo'lgan ko'rinishda chizadi.
 *
 * Ko'rik topilmasi (IMPORTANT): eski ko'rinish `prompt` va `richtig`ni
 * ikkita `span`ga solib, bitta `justify-between` qatorga joylardi.
 * `DIALOG_LUECKE`da `prompt` BUTUN suhbat (bir necha qator matn),
 * `ZUORDNEN`/`PAAR`da `richtig` esa bir necha juftlikni pipe bilan
 * ulagan uzun qator — ikkalasi ham bitta bo'yalgan qatorga sig'maydi.
 * Bu yerda FORMATga qarab uchta ko'rinish tanlanadi:
 *  - `DIALOG_LUECKE` — suhbat o'rniga qisqa `titel` (dialog nomi),
 *    javob (bitta yo'q bo'lgan qator) o'zgarishsiz qoladi.
 *  - `ZUORDNEN`/`PAAR` (jonli juftlash, Task 3 ko'rik topilmasi:
 *    ikkalasi ham "chap=o'ng|…" shaklida BITTA mexanizm — `yigish.tsx`
 *    dagi izohga qarang) — `richtig`ni "chap=o'ng" juftlariga bo'lib,
 *    RO'YXAT sifatida chizadi (bitta uzun qalin qator emas).
 *  - qolgan formatlar — eski ikkita `span`li ko'rinish; chap ustun
 *    `xatoYorligi()` orqali tanlanadi (`AUDIO_WORT`/`WORT_TIPPEN`da
 *    `prompt` bo'sh bo'lgani uchun sobit "Eshitish savoli" yorlig'iga
 *    almashtiriladi — Task 4 ko'rik topilmasi, `natija-xabari.ts`ga
 *    qarang).
 *
 * The right answer is the one to learn, so it is bold ink, never red (ADR-0128).
 */
function XatoQatori({ xato }: { xato: SeansXato }) {
  const t = useT();
  if (xato.format === "ZUORDNEN" || xato.format === "PAAR") {
    // Re-review topilmasi (Minor): `pruefeZuordnen`ning fail-closed yo'li
    // (`funktionUz` kolliziyasi) `richtig: ''` qaytarishi mumkin edi —
    // ZUORDNEN uchun kamdan-kam server-tomon kolliziya. `''.split("|")`
    // BO'SH MASSIV EMAS — `[""]` beradi, ya'ni tuzatilmasa shu yerda
    // bitta BO'SH qator (chapsiz, o'ngsiz) tint fon ichida chizilib
    // qolardi. Bunday holatda umuman ro'yxat chizmaymiz. Jonli
    // juftlashda (`seans-ekrani.tsx`, `juftlarniRichtigga`) `richtig`
    // amalda hech qachon bo'sh kelmaydi — savol faqat BARCHA juft
    // yashil bo'lgach tugaydi — lekin bu qo'riqchi shart bo'lmagan
    // taqdirda ham zararsiz.
    if (!xato.richtig) return null;
    const juftlar = xato.richtig.split("|").map((juft) => {
      const [chap, ong] = juft.split("=");
      return { chap: chap ?? "", ong: ong ?? "" };
    });
    return (
      <ul className="space-y-1">
        {juftlar.map((j, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-ink-600">{j.chap}</span>
            <span className="font-bold text-ink-900">{j.ong}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (xato.format === "DIALOG_LUECKE") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink-800">
          {xato.titel ?? t("Dialog")}
        </span>
        <span className="text-sm font-bold text-ink-900">{xato.richtig}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5 font-semibold text-ink-800">
        {/* Picture questions: the picture, never its URL, beside the word. */}
        {xato.bildUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={xato.bildUrl}
            alt=""
            className="size-10 shrink-0 rounded-lg bg-white object-cover"
          />
        ) : null}
        <DeWort text={xatoYorligi(xato.format, xato.prompt, t)} />
      </span>
      <DeWort text={xato.richtig} className="text-sm font-bold text-ink-900" />
    </div>
  );
}

/**
 * Seans tugagandan keyingi natija ekrani: ball, sarflangan vaqt va
 * xato qilingan so'zlar. To'g'ri javob har bir xato uchun `xatolar`
 * ichida allaqachon bor — bu ekran hech narsani qayta hisoblamaydi,
 * faqat `seans-navbat.ts` yig'gan holatni ko'rsatadi.
 *
 * Ball, seriya va o'rinni server `natija` sifatida qaytaradi — bu ekran
 * faqat ko'rsatadi (spec 2026-10-18 §5).
 *
 * The top is `NatijaSahna` inside the theme's reward background; whether it
 * celebrates is `natijaHissiyoti(sinov)` (ADR-0128).
 */
export function NatijaEkrani({
  togri,
  jami,
  durationMs,
  xatolar,
  unitId,
  onQayta,
  natija,
  sinov,
  onNatijaQaytaYubor,
  takrorlash = false,
}: NatijaEkraniProps) {
  const t = useT();
  const router = useRouter();
  const { tema } = useLernenTema();
  // Less motion (device switch or system) resolves the entrance fade at once (globals.css).
  const kam = useKamHarakat();
  const davomHref = unitId
    ? `/portal/lernen/units/${unitId}`
    : "/portal/lernen";
  const korinish = sinov ? sinovKorinishi(sinov, t) : null;
  const hissiyot = natijaHissiyoti(sinov);

  const qator = natijaQatorlari(natija, t);
  // Points and the streak are the scene's cards now; these lines are the rest.
  const yutuqlarBormi =
    qator.orin != null || qator.maqsad != null || qator.nishonlar.length > 0;

  return (
    <div
      data-kam-harakat={kam ? "" : undefined}
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-8"
    >
      <FadeIn className="space-y-4">
        <tema.MukofotFoni bayram={hissiyot.bayram}>
          <NatijaSahna
            togri={togri}
            jami={jami}
            durationMs={durationMs}
            ball={natija?.punkte ?? null}
            serie={natija?.serie ?? null}
            hissiyot={hissiyot}
            takrorlash={takrorlash}
          />
        </tema.MukofotFoni>

        {korinish ? (
          <Card
            role="status"
            aria-live="polite"
            className={cn(
              "space-y-1 text-center",
              korinish.ohang === "muvaffaqiyat" && "bg-success/10",
              // A failed test or a failed request is the soft amber, never a red wall.
              korinish.ohang === "xavf" && "bg-amber-500/10",
            )}
          >
            <p className="font-display text-xl font-bold text-ink-900">
              {korinish.sarlavha}
            </p>
            <p className="font-semibold text-ink-600">{korinish.matn}</p>
          </Card>
        ) : null}

        {yutuqlarBormi ? (
          <Card className="space-y-1.5 text-center">
            {qator.orin ? (
              <p className="text-sm font-semibold text-ink-700">{qator.orin}</p>
            ) : null}
            {qator.maqsad ? (
              <p className="text-sm font-bold text-success">{qator.maqsad}</p>
            ) : null}
            {qator.nishonlar.map((matn) => (
              <p key={matn} className="text-sm font-bold text-ink-900">
                {matn}
              </p>
            ))}
          </Card>
        ) : null}

        <Card className="space-y-3">
          {xatolar.length === 0 ? (
            <p className="text-center font-semibold text-ink-700">
              {t("Hammasi to'g'ri — ajoyib natija!")}
            </p>
          ) : (
            <>
              <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                {t("Qaytarib ko'ring · {n}", { n: xatolar.length })}
              </p>
              <ul className="space-y-2">
                {xatolar.map((x, i) => (
                  <li
                    key={`${x.itemType}:${x.itemId}:${i}`}
                    className="rounded-xl bg-tint px-3.5 py-2.5"
                  >
                    <XatoQatori xato={x} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="flex gap-2">
          {korinish?.asosiy === "qayta-yubor" ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Mashqdan chiqish")}
              </Button>
              <Button className="flex-1" onClick={onNatijaQaytaYubor}>
                {t("Qayta yuborish")}
              </Button>
            </>
          ) : korinish?.asosiy === "qayta" ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Yo'lga qaytish")}
              </Button>
              <Button className="flex-1" onClick={onQayta}>
                {t("Qayta urinish")}
              </Button>
            </>
          ) : korinish?.asosiy === null ? (
            // Natija kutilmoqda: davom etish (o'tdi/o'tmadi noma'lum) o'chiq,
            // lekin CHIQISH ochiq — internet osilib qolsa o'quvchi bu ekranda
            // qamalib qolmasin (pastki menyu seans sahifasida yo'q). So'rov
            // fonda davom etadi va yo'l keshini o'zi yangilaydi.
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Mashqdan chiqish")}
              </Button>
              <Button className="flex-1" disabled>
                {t("Davom etish")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" className="flex-1" onClick={onQayta}>
                {korinish ? t("Qayta urinish") : t("Qayta o'tish")}
              </Button>
              <Button className="flex-1" onClick={() => router.push(davomHref)}>
                {t("Davom etish")}
              </Button>
            </>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
```

`L/uebung/seans-ekrani.tsx` — Edit (bitta prop), old:

```tsx
        sinov={sinovHolati}
        onNatijaQaytaYubor={natijaniQaytaYubor}
      />
```

new:

```tsx
        sinov={sinovHolati}
        onNatijaQaytaYubor={natijaniQaytaYubor}
        takrorlash={!darsMi}
      />
```

- [ ] **Step 6: i18n — the new file and its texts**

`client/src/i18n/i18n-coverage.test.ts` — Edit, old:

```ts
  "components/student-portal/lernen/uebung/natija-ekrani.tsx",
```

new:

```ts
  "components/student-portal/lernen/uebung/natija-ekrani.tsx",
  "components/student-portal/lernen/uebung/natija-sahna.tsx",
```

Avval tekshiring (`grep -n '^  "Dars tugadi!"\|^  "Takrorlash tugadi!"\|^  "Ball"\|^  "Aniqlik"' client/src/i18n/dictionaries/ru.ts` — bo'sh bo'lishi kerak; `"Seriya"` allaqachon bor, qo'shilmaydi). `"+{n} ball"` va `"seriya"` endi hech qayerda ishlatilmaydi (`grep -rnF '"+{n} ball"' client/src --include='*.tsx' --include='*.ts' | grep -v dictionaries` — bo'sh) — o'chiriladi.

`client/src/i18n/dictionaries/ru.ts` — Edit 1, old:

```ts
  "+{n} ball": "баллы: +{n}",
  "seriya": "серия",
  "Hammasi to'g'ri — ajoyib natija!": "Всё верно — отличный результат!",
```

new:

```ts
  "Hammasi to'g'ri — ajoyib natija!": "Всё верно — отличный результат!",
```

Edit 2, old:

```ts
};

export default ru;
```

new:

```ts
  "Dars tugadi!": "Урок пройден!",
  "Takrorlash tugadi!": "Повторение пройдено!",
  "Ball": "Баллы",
  "Aniqlik": "Точность",
};

export default ru;
```

`client/src/i18n/dictionaries/de.ts` — Edit 1, old:

```ts
  "+{n} ball": "Punkte: +{n}",
  "seriya": "Serie",
  "Hammasi to'g'ri — ajoyib natija!": "Alles richtig — tolles Ergebnis!",
```

new:

```ts
  "Hammasi to'g'ri — ajoyib natija!": "Alles richtig — tolles Ergebnis!",
```

Edit 2, old:

```ts
};

export default de;
```

new:

```ts
  "Dars tugadi!": "Lektion geschafft!",
  "Takrorlash tugadi!": "Wiederholung geschafft!",
  "Ball": "Punkte",
  "Aniqlik": "Genauigkeit",
};

export default de;
```

`client/src/i18n/dictionaries/en.ts` — Edit 1, old:

```ts
  "+{n} ball": "Points: +{n}",
  "seriya": "streak",
  "Hammasi to'g'ri — ajoyib natija!": "All correct — great result!",
```

new:

```ts
  "Hammasi to'g'ri — ajoyib natija!": "All correct — great result!",
```

Edit 2, old:

```ts
};

export default en;
```

new:

```ts
  "Dars tugadi!": "Lesson complete!",
  "Takrorlash tugadi!": "Review complete!",
  "Ball": "Points",
  "Aniqlik": "Accuracy",
};

export default en;
```

- [ ] **Step 7: Run the tests, the i18n check, types and lint**

Run: `cd client && npx vitest run src/components/student-portal/lernen/uebung`
Expected: PASS (`natija-sahna`, `natija-ekrani`, `javob-ohangi` 8 fayl bilan, `natija-xabari`, `sinov-natijasi`).

Run: `cd client && npm run i18n:check`
Expected: PASS.

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen`
Expected: 0 xato. (Agar React Compiler lint qoidasi `<tema.MukofotFoni>` ga e'tiroz bildirsa: `const { MukofotFoni } = tema;` deb, JSX da `<MukofotFoni bayram={hissiyot.bayram}>` yozing va faqat eslint'ni qayta ishlating.)

- [ ] **Step 8: Commit**

```bash
git add client/src/components/student-portal/lernen/uebung client/src/i18n/i18n-coverage.test.ts client/src/i18n/dictionaries/ru.ts client/src/i18n/dictionaries/de.ts client/src/i18n/dictionaries/en.ts
git commit -m "feat(lernen): result scene with the reward sound, confetti, Dafi and three cards

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — unit sahifasi: lavha va «joy» kartalari

**Files:**
- Modify: `L/lernen-unit-page.tsx` (butun fayl), `L/lernen-unit-page.test.ts`
- Modify: `L/tema/toza/toza-tugun-model.ts`, `L/tema/toza/toza-tugun-model.test.ts`

**Interfaces:**
- Consumes: `useLernenTema().tema.UnitLavha` (Task 7); `belgiTuri(holat)`, `tugunRangi(holat, tone)` (`toza-tugun-model.ts`); `seansHolatlari` (`fortschritt.ts`, o'zgarmaydi); `ovozChal`, `ovozniUygot`; `useKamHarakat`; CSS `data-kam-harakat` (Task 2).
- Produces:
  - `DARAJA_TONI: Record<string, TugunTone>` (`A1 → coral`, `A2 → teal`, `B1 → grape`) — `toza-tugun-model.ts` da.
  - Unit sahifasi: `<Screen data-kam-harakat>`, birinchi bola `<tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} />` (bo'limli va eski yassi ro'yxatda), har dars — `SeansJoyi` (`aria-disabled` qulf, `qulf` ovozi; ochiq/bajarilgan — `bos` ovozi va dars ochiladi; joriysida «Boshlash»).
  - Mavjud test matnlari o'zgarmaydi: «So'zlar: 14 / 28», «So'zlar: 9 / 9», bitta «Yana mashq qilish · 14 yangi so'z», `student-portal-load-states.test.ts` dagi offline/xato matnlari.

- [ ] **Step 1: Write the failing tests**

`L/tema/toza/toza-tugun-model.test.ts` — Edit, old:

```ts
import { belgiTuri, tugunRangi } from "./toza-tugun-model";
```

new:

```ts
import { DARAJA_TONI, belgiTuri, tugunRangi } from "./toza-tugun-model";
```

va faylning OXIRIGA:

```ts
describe("DARAJA_TONI", () => {
  it("is the path's CEO-approved level colours: A1 coral, A2 teal, B1 grape", () => {
    expect(DARAJA_TONI).toEqual({ A1: "coral", A2: "teal", B1: "grape" });
  });
});
```

`L/lernen-unit-page.test.ts` — Edit 1, old:

```ts
async function matn(): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => unit });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(LernenUnitPage, { unitId: 7 }),
    ),
  )
    .replace(/<[^>]*>/g, " ")
```

new:

```ts
async function html(): Promise<string> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await client.prefetchQuery({ queryKey: ["lernen", "unit", 7], queryFn: () => unit });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(LernenUnitPage, { unitId: 7 }),
    ),
  );
}

async function matn(): Promise<string> {
  return (await html())
    .replace(/<[^>]*>/g, " ")
```

Edit 2 — faylning OXIRIGA:

```ts
// Spec §8: the unit page is not a bare list. Fixture order (one lock chain over
// the unit): 1 done, 2 current, 5 done, 3 and 4 locked.
describe("the unit page draws its lessons as places", () => {
  it("opens with the theme's banner: the unit's line and Dafi waving hello", async () => {
    const h = await html();
    expect(h).toContain("A1 · Essen und Trinken");
    expect(h).toContain('data-holat="salom"');
  });

  it("offers «Boshlash» on the current lesson only", async () => {
    expect((await matn()).match(/Boshlash/g)).toHaveLength(1);
  });

  it("keeps a locked lesson pressable for the locked sound, but tells it is closed", async () => {
    const h = await html();
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(h).not.toMatch(/<button[^>]*\sdisabled=""/);
    expect(h).toContain("Tanishuv — hali ochilmagan");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd client && npx vitest run src/components/student-portal/lernen/lernen-unit-page.test.ts src/components/student-portal/lernen/tema/toza/toza-tugun-model.test.ts`
Expected: FAIL — `DARAJA_TONI` undefined; `data-holat="salom"` yo'q; «Boshlash» 0 marta; `disabled=""` bor.

- [ ] **Step 3: The level tones**

`L/tema/toza/toza-tugun-model.ts` — Edit, old:

```ts
const lab = (yuz: string) => `color-mix(in srgb, ${yuz} 72%, black)`;
```

new:

```ts
const lab = (yuz: string) => `color-mix(in srgb, ${yuz} 72%, black)`;

/** The path's level colours (CEO-approved): A1 coral, A2 teal, B1 grape. */
export const DARAJA_TONI: Record<string, TugunTone> = { A1: "coral", A2: "teal", B1: "grape" };
```

- [ ] **Step 4: Rebuild the unit page**

`L/lernen-unit-page.tsx` — butun fayl (Write):

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, CheckCircle, LockSimple, Star } from "@phosphor-icons/react";
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
import { DARAJA_TONI, belgiTuri, tugunRangi } from "./tema/toza/toza-tugun-model";
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

/**
 * One lesson as a «place» of the unit (spec §8): the path's own node badge
 * (check, star, lock), the name, and «Boshlash» on the current one. A locked
 * place stays a button — it answers with the short "locked" sound — but tells
 * screen readers it is closed, as the path node does.
 */
function SeansJoyi({
  seans,
  holat,
  tone,
  onOpen,
  onQulf,
  yanaMashq,
}: {
  seans: LernenSeans;
  holat: SeansHolatBelgisi;
  tone: TugunTone;
  onOpen: (id: number) => void;
  onQulf: () => void;
  /** Under a finished section lesson while the section has unmet words. */
  yanaMashq?: string | null;
}) {
  const t = useT();
  const tugun = TUGUN_HOLATI[holat];
  const qulf = tugun === "locked";
  const joriy = tugun === "active";
  const { yuz, lab } = tugunRangi(tugun, tone);
  const belgi = belgiTuri(tugun);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;
  const nom = seansNomi(seans, t);
  const izoh =
    tugun === "done" && (seans.kind === "SECTION_A" || seans.kind === "SECTION_B")
      ? yanaMashq
      : null;
  return (
    <button
      type="button"
      onClick={qulf ? onQulf : () => onOpen(seans.id)}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label: nom }) : undefined}
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
        <span
          className={cn(
            "block truncate font-semibold",
            qulf ? "text-ink-400" : "text-ink-900",
          )}
        >
          {nom}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-coral-600">
            {izoh}
          </span>
        ) : null}
      </span>
      {joriy ? (
        <span
          className="shrink-0 rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
          style={{ background: yuz }}
        >
          {t("Boshlash")}
        </span>
      ) : null}
    </button>
  );
}

/** The section's word counter: «So'zlar: 14 / 28» and a thin bar (ADR-0071). */
function SozlarQatori({ hisob }: { hisob: SozHisoblagichi }) {
  return (
    <div className="space-y-1 px-1">
      <p
        className={cn(
          "flex items-center gap-1 text-xs font-bold tabular-nums",
          hisob.tugadi ? "text-success" : "text-ink-500",
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
 * The header is the theme's (`LernenTema.UnitLavha`); the places reuse the
 * «Toza» node model (ADR-0128).
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
    import("./ovoz/ovoz-motor").catch(() => {});
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

  // A unit whose content is not written yet still has its seeded lessons;
  // the server says so with `bereit: false` (absent from an older server).
  const boshMi =
    data &&
    (data.bereit === false ||
      (data.sections.length === 0 && data.lessons.length === 0));

  return (
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
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} />

          {data.sections.map((section) => {
            const hisob = sozHisoblagichi(section.woerter, t);
            return (
              <section key={section.id} className="space-y-2">
                <div className="px-1">
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-400">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} /> : null}
                <div className="space-y-2">
                  {section.lessons.map((l) => (
                    <SeansJoyi
                      key={l.id}
                      seans={l}
                      holat={holatMap.get(l.id) ?? "QULF"}
                      tone={tone}
                      onOpen={openLesson}
                      onQulf={qulfBosildi}
                      yanaMashq={hisob?.yanaMashq}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {data.finalTest ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h2 className="px-1 font-display text-base font-extrabold text-ink-900">
                {t("Yakuniy sinov")}
              </h2>
              <SeansJoyi
                seans={data.finalTest}
                holat={holatMap.get(data.finalTest.id) ?? "QULF"}
                tone={tone}
                onOpen={openLesson}
                onQulf={qulfBosildi}
              />
            </section>
          ) : null}
        </Stagger>
      ) : (
        // Eski DiB uniti: bo'lim yo'q, darslar guruhsiz ro'yxat.
        <Stagger className="space-y-2">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} />
          {data.lessons.map((l) => (
            <SeansJoyi
              key={l.id}
              seans={l}
              holat={yassiHolatMap.get(l.id) ?? "QULF"}
              tone={tone}
              onOpen={openLesson}
              onQulf={qulfBosildi}
            />
          ))}
        </Stagger>
      )}
    </Screen>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd client && npx vitest run src/components/student-portal/lernen/lernen-unit-page.test.ts src/components/student-portal/lernen/tema src/components/student-portal/student-portal-load-states.test.ts`
Expected: PASS (eski uchta «So'zlar» testi va load-states ham).

Run: `cd client && npm run i18n:check`
Expected: PASS (yangi kalit yo'q: «Boshlash» va «{label} — hali ochilmagan» lug'atda bor).

Run: `cd client && npx tsc --noEmit && npx eslint src/components/student-portal/lernen`
Expected: 0 xato. (Task 8 dagi kabi: Compiler qoidasi `<tema.UnitLavha>` ga e'tiroz bildirsa — `const { UnitLavha } = tema;` va `<UnitLavha … />`.)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/student-portal/lernen/lernen-unit-page.tsx client/src/components/student-portal/lernen/lernen-unit-page.test.ts client/src/components/student-portal/lernen/tema/toza/toza-tugun-model.ts client/src/components/student-portal/lernen/tema/toza/toza-tugun-model.test.ts
git commit -m "feat(lernen): unit page with the theme banner and lessons as places with sounds

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR-0128, hujjatlar, to'liq tekshiruv va brauzer ro'yxati

**Files:**
- Create: `docs/adr/0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md`
- Modify: `docs/adr/README.md`, `client/CLAUDE.md`

**Interfaces:**
- Consumes: Task 1–9 dagi barcha nomlar (`LernenTema.MukofotFoni`, `LernenTema.UnitLavha`, `natijaHissiyoti`, `useJavobSezgisi().javobKeldi`, `javob-ohangi.ts`, `Dafi tetik`, `data-kam-harakat`).
- Produces: ADR va `client/CLAUDE.md` dagi «Ta'lim look» bandi kod bilan bir xil; to'liq gate yashil; nazoratchi uchun brauzer ro'yxati.

- [ ] **Step 1: Check the ADR number is still free**

Run: `ls docs/adr | tail -3 && git fetch -q origin main && git ls-tree -r origin/main --name-only docs/adr | tail -3`
Expected: oxirgi raqam `0127` (ikkala joyda). Agar `0128` band bo'lsa — keyingi bo'sh raqamni oling va quyidagi fayl nomi, sarlavha, README qatori va `client/CLAUDE.md` dagi «ADR-0128» yozuvlarini shunga moslang.

- [ ] **Step 2: Write the ADR**

`docs/adr/0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md`:

```markdown
# ADR-0128 — Ta'lim mashq va natija ekrani: tema shartnomasiga ikki o'rin, xato javob yumshoq

**Holati:** Qabul qilindi
**Sana:** 2026-10-25
**Bog'liq:** `docs/superpowers/specs/2026-10-24-lernen-dizayn-tanlash-design.md` (§3, §8, §9, §12), `docs/superpowers/plans/2026-10-25-lernen-dizayn-mashq-natija.md`, ADR-0125

## Kontekst

Ta'lim dizaynining 2-bosqichi: mashq ekrani, javob ovozi va Dafi, natija ekrani (mukofot) va unit sahifasi. Ilgari xato javob qizil «Noto'g'ri» edi — spec §3 dagi «xato jazolamaydi» qoidasiga zid; natija ekranida ovoz, konfeti va Dafi yo'q edi; unit sahifasi oddiy ro'yxat edi. Keyingi temalar (O'rmon, Dengiz, Nemis sayohati) natija foni va unit sarlavhasini o'zicha chizadi: shartnoma hozir kengaytirilmasa, har tema bosqichida bu ekranlarga qayta tegish kerak bo'lardi.

## Qaror

1. **`LernenTema` ga ikki o'rin:** `MukofotFoni` (`{ bayram, children }` — natija sahnasining foni; «Toza»: oddiy koral tus) va `UnitLavha` (`{ daraja, matn }` — unit sahifasining sarlavhasi; «Toza»: daraja rangidagi lavha va salom berayotgan Dafi). Reyestr testi har tayyor temada ikkalasi borligini tekshiradi. Mashq sarlavhasi, variantlar, pastki panel, konfeti, ball sanog'i, ovoz va Dafi qarorlari temaga bog'liq emas.
2. **Xato javob — yumshoq «Deyarli!»:** amber rang (qizil emas), «To'g'ri javob: X», yumshoq `xato` ovozi, Dafi «yumshoq xato». Yakuniy sinovdan o'tilmaganda va natija tekshirilmay qolganda ham amber karta. Rang bitta joyda (`uebung/javob-ohangi.ts`); test javob vidjetlari va natija ekranida `danger` sinfi yo'qligini tekshiradi. Tarmoq xatosi xato javob emas va qizil bo'lib qoladi.
3. **Natija bayrami (`natijaHissiyoti`):** oddiy dars va takrorlash — har doim (`mukofot` bir marta, konfeti, Dafi 3 sakrashi); yakuniy sinov — faqat server `tayyor` + `bestanden` desa. Kutilayotganda Dafi o'ylaydi, o'tilmasa yumshoq xato, so'rov yiqilsa tinch. Ovoz bir marta (React StrictMode'da ham, ref bilan). Kam harakatda konfeti yo'q, Dafi statik, o'tishlar darrov; ovoz alohida sozlama.
4. **Javob ovozi va Dafi server hukmi callback'idan** (`pruefen` va har juftning `onSuccess`) chalinadi, `natija` effektidan emas: juftlash formatlarining sintetik yakuniy natijasi ikkinchi marta chalardi. Juftlashda har juft uchun; tarmoq xatosida jim. `ovozniUygot()` bosishning o'zida (iOS, Telegram).
5. **Qurilmaning «Kam harakat» kaliti** ekran ildizidagi `data-kam-harakat` orqali `lumio-fade-up`, `lumio-stagger` va `lumio-shake` ni ham tizim sozlamasi kabi darrov yechadi.

## Rad etilgan yo'llar

- **Qizil «Noto'g'ri»ni qoldirish:** spec §3 ga zid; CEO yumshoq ohangli mockupni (duo.html) tanlagan.
- **Shartnomani 3-bosqichgacha kengaytirmaslik:** har tema bosqichida natija va unit ekranlari qayta ochilardi.
- **Yakuniy sinovni mijoz sanog'i bo'yicha nishonlash:** o'tdi/o'tmadini faqat server aytadi (`sinov-natijasi.ts`); noto'g'ri bayram o'chirib bo'lmaydigan xato.
- **Ovozni `natija` effektidan chalish:** juftlashda sintetik natija ikkinchi ovozni berardi, StrictMode'da esa effekt ikki marta yuradi.

## Oqibatlar

- Yangi tema `TugunBelgisi`, `MukofotFoni` va `UnitLavha` ni beradi.
- Unit sahifasidagi «joy» kartalari hozircha «Toza» tugun modelidan (`toza-tugun-model.ts`) foydalanadi; o'z unit sahnasi bo'lgan tema kelganda ular shartnomaga ko'chiriladi.
- «Noto'g'ri», «+{n} ball» va kichik harfli «seriya» matnlari lug'atlardan olib tashlandi.
```

- [ ] **Step 3: Index row**

`docs/adr/README.md` — Edit (agar `main` da 0127 dan keyin yangi qator bo'lsa, ENG OXIRGI jadval qatoridan keyin qo'ying), old:

```markdown
| [0127](0127-daraja-testi-taklifi-bir-martalik-yuborish.md) | «Darajani aniqlash» taklifi botdan foydalana oladigan hammaga BIR marta: auditoriya (hamma holatdagi o'quvchilar + kanal tekshiruvidagi odamlar, xodimlarsiz), `LevelTestInvite` yuborishdan oldin egallanadi, `LEVEL_TEST_INVITE` off/log/on va sana, cron 20:00 | Qabul qilindi | 2026-10-25 |
```

new:

```markdown
| [0127](0127-daraja-testi-taklifi-bir-martalik-yuborish.md) | «Darajani aniqlash» taklifi botdan foydalana oladigan hammaga BIR marta: auditoriya (hamma holatdagi o'quvchilar + kanal tekshiruvidagi odamlar, xodimlarsiz), `LevelTestInvite` yuborishdan oldin egallanadi, `LEVEL_TEST_INVITE` off/log/on va sana, cron 20:00 | Qabul qilindi | 2026-10-25 |
| [0128](0128-lernen-mashq-natija-tema-orinlari-yumshoq-xato.md) | Ta'lim mashq va natija ekrani: `LernenTema` ga `MukofotFoni` va `UnitLavha`; xato javob yumshoq (amber «Deyarli!», qizil yo'q); natija bayrami faqat server o'tdi deganda (yakuniy sinov); javob ovozi server hukmidan; «Kam harakat» fade/stagger/shake ga ham | Qabul qilindi | 2026-10-25 |
```

- [ ] **Step 4: Keep `client/CLAUDE.md` in step**

`client/CLAUDE.md` — Edit 1, old:

```markdown
A theme only DRAWS (`LernenTema.TugunBelgisi` today): the path, locks and points are shared and untouched.
```

new:

```markdown
A theme only DRAWS — `LernenTema.TugunBelgisi` (the path node), `MukofotFoni` (the result screen's reward background) and `UnitLavha` (the unit page header), ADR-0128 — while the path, locks, points, the exercise screen, the confetti and the sound/Dafi decisions are shared and untouched.
```

Edit 2, old:

```markdown
The system's reduced-motion setting can only add to the student's choice, never be overridden.
```

new:

```markdown
The system's reduced-motion setting can only add to the student's choice, never be overridden. **Exercise and result (ADR-0128).** A wrong answer is the soft «Deyarli!»: amber, never red (`uebung/javob-ohangi.ts`; `javob-ohangi.test.ts` fails on a `danger` class in the answer widgets and the result screen); a network error is not a wrong answer and stays red. The verdict's sound and Dafi's reaction fire from the check's mutation callbacks (`useJavobSezgisi().javobKeldi`), once per verdict and once per pair — never from an effect on the answer, never on a network error — and `ovozniUygot()` runs inside the tap. The result screen celebrates (`mukofot` once, confetti, Dafi's three hops) per `natijaHissiyoti(sinov)`: always for a lesson or a review, for a final test only when the server says it was passed. `Dafi` takes `tetik` to replay the same state. Screen roots carry `data-kam-harakat`, so the device's «Kam harakat» also resolves `lumio-fade-up`, `lumio-stagger` and `lumio-shake` at once.
```

- [ ] **Step 5: Full gate (one at a time, never build in parallel with tests)**

Run: `cd client && npx vitest run`
Expected: PASS (butun to'plam: `i18n-coverage`, `globals-css`, `student-portal-*`, `lernen/**`).

Run: `cd client && npm run i18n:check`
Expected: PASS.

Run: `cd client && npx tsc --noEmit`
Expected: 0 xato.

Run: `cd client && npx eslint src`
Expected: `✖ N problems (0 errors, …)` yoki xatosiz (faqat `errors` soni muhim).

Run: `cd client && npm run build`
Expected: muvaffaqiyatli build.

Biror buyruq qizil bo'lsa — tuzating va faqat o'sha buyruqni qayta ishlating.

Run: `git diff --stat $(git merge-base HEAD origin/main) HEAD -- server client/src/components/student-portal/lernen/seans-navbat.ts client/src/components/student-portal/lernen/fortschritt.ts client/src/components/student-portal/lernen/yol/yol-tuzilishi.ts`
Expected: bo'sh (server va holat mashinasi tegilmagan).

- [ ] **Step 6: Commit**

```bash
git add docs/adr client/CLAUDE.md
git commit -m "docs(lernen): ADR-0128, README index and the client CLAUDE.md note for phase 2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Browser checklist (the controller runs it with a mock API)**

Bu qadam kod yozmaydi; natija (skrinshotlar va topilmalar) nazoratchiga beriladi. Mock API (student portal, `…/student-portal/lernen/*`): `lessons/:id/uebung` (har format uchun bittadan savol), `uebung/check` (`isCorrect` true/false, rasm/soat uchun `loesungWort`), `uebung/juft` (juft uchun true/false), `lessons/:id/abschluss` (`natija` bilan; yakuniy sinov uchun `sinov` — `bestanden` true/false, 1–2 s kechikish, bir marta 500), `wiederholung/uebung` + `wiederholung/abschluss`, `units/:id` (bo'limli A1 unit va bo'limsiz eski unit). `next dev` — React StrictMode yoqilgan.

1. **Mashq, to'g'ri javob (Tanlash, `WORT_UZ`), yorug' rejim, ovoz yoqiq:** variant bosilganda koral ramka; «Javobni tekshirish» → variant yashil, pastki panel yashil tusda, «To'g'ri!», `togri` ovozi BIR marta, Dafi uch marta sakraydi va qo'l silkitadi; «Keyingi» → Dafi yana o'ylaydi. Ketma-ket ikki to'g'ri javob — ikki marta bayram.
2. **Xato javob:** variant amber ramka + amber ✕, panel amber tusda, «Deyarli!» + «To'g'ri javob: X», yumshoq `xato` ovozi, Dafi yumshoq xato. Ekranning hech qayerida qizil yo'q.
3. **Formatlar namunasi:** `LUECKE` (yozish; xato → amber maydon; Enter bilan tekshirishda ham ovoz), `BILD_WORT`/`AUDIO_BILD` (amber ramka va ✕; panelda so'z, URL emas), `UHR_LESEN` (panelda «halb vier»), `SATZ_BAUEN` (xato → amber qator va plitkalar), `PAAR` va `ZUORDNEN` (har juft o'z ovozi va Dafi reaksiyasi; ikki to'g'ri juft — ikki bayram; xato juft 0.5 s amber chaqnaydi; oxirida qo'shimcha ovoz YO'Q; birinchi urinishda xato bo'lsa panel tussiz «Hammasi to'g'ri! Ammo…»), `HOEREN_WAHL` (klip o'ynayotganda javob berilsa effekt chalinmaydi — ADR-0125 bo'yicha qabul qilingan).
4. **Tarmoq xatosi** (`uebung/check` → offline): «Yuborib bo'lmadi…» qizil matn, ovoz yo'q, Dafi o'zgarmaydi.
5. **Ilgarilash chizig'i:** 16 px koral, yaltiroq chiziq, kichik «oshib qaytish» bilan siljiydi.
6. **URL bilan ochilgan seans** (`/portal/lernen/lessons/:id` da sahifani yangilash): birinchi tekshirishdayoq ovoz chiqadi.
7. **Natija — oddiy dars:** `mukofot` BIR marta (StrictMode'da ham), butun ekranda ~2 s konfeti, katta Dafi uch sakrab qo'l silkitadi, «Dars tugadi!», «12 / 15 · 1:05», kartalar Ball (server javob bergach 0 dan sanaydi) / Aniqlik % / Seriya; koral tusli fon; xatolar ro'yxatida to'g'ri javob qizil emas.
8. **Natija — takrorlash:** «Takrorlash tugadi!», bayram bor.
9. **Yakuniy sinov:** kutilayotganda Dafi o'ylaydi, ovoz va konfeti yo'q, «Natija tekshirilmoqda»; `bestanden: true` → bayram; `bestanden: false` → yumshoq xato, `mukofot` va konfeti yo'q, amber «Hali o'tmadingiz» kartasi; `abschluss` 500 → Dafi tinch, amber «Natijani tekshirib bo'lmadi», «Qayta yuborish» muvaffaqiyatidan keyin mos holat.
10. **«Qayta o'tish»** va yana tugatish → bayram yana bir marta (yangi ekran).
11. **Unit sahifasi:** daraja rangidagi lavha, Dafi salom beradi; joylar ✓ / ★ / qulf belgilari; joriysida daraja rangli ramka va «Boshlash»; ochiq/bajarilgan joy bosilsa `bos` va dars ochiladi; qulfli bosilsa `qulf`, hech narsa ochilmaydi; klaviatura/VoiceOver: qulfli fokuslanadi va «— hali ochilmagan» deb o'qiladi; bo'limsiz eski unit ham shu kartalar bilan chiziladi; kirish stagger bilan.
12. **Qorong'u rejim:** yuqoridagi hamma ekran; yashil/amber tuslar va «Deyarli!» o'qiladi; lavhada Dafi ko'rinadi.
13. **360 px telefon:** pastki panel (Dafi + matn + tugma) sig'adi, gorizontal skroll yo'q; natija kartalari bir qatorda, ru/de sarlavhalari («ТОЧНОСТЬ», «GENAUIGKEIT») sig'adi; unit kartalari va «Boshlash» yorlig'i.
14. **Desktop, rail ochiq/yopiq:** pastki panel rail tugagan joydan boshlanadi.
15. **Qurilma «Kam harakat» yoqiq (Sozlamalar), tizim o'chiq:** chiziq sakrab o'zgaradi, panel tusi darrov; natijada konfeti yo'q, Dafi statik, FadeIn darrov, sanoq darrov; unit sahifasi stagger'siz; lavhadagi Dafi statik. Ovoz baribir chaladi.
16. **Ovoz o'chiq (Sozlamalar → «Ovozlar»):** hech qayerda ovoz yo'q; DevTools'da `AudioContext` yaratilmagan.
17. **Tillar ru/de/en:** «Почти!», «Урок пройден!», «Lektion geschafft!», «Almost!» va kartalar sarlavhalari.
18. **Haqiqiy qurilma (bo'lsa):** iPhone Safari va Telegram Mini App — birinchi hukm ovozi chiqadi (ovoz bosishning o'zida uyg'otiladi).

---

## Self-Review

**1. Spec coverage** (spec/qaror → task):
- §12 bosqich 2 — mashq ekrani (Task 3, 4, 5), javob ovozi + Dafi (Task 1, 5), natija ekrani/mukofot (Task 1, 6, 8), unit sahifasi (Task 9).
- §3.3 «xato jazolamaydi» / qaror 2 — Task 3 (vidjetlar, panel matni, lug'at), Task 8 (natija ekranidagi to'g'ri javob rangi, sinov kartasi amber), qo'riqchi test (`javob-ohangi.test.ts`, Task 3 + 8).
- §9 ovoz xaritasi — `togri`/`xato` (Task 5), `mukofot` (Task 8), `bos`/`qulf` (Task 9), `unitOchildi` faqat yo'l varag'ida (tegilmaydi; qaror 4).
- §9 «dars tugashi → mukofot + konfeti + Dafi 3 sakrashi» va qaror 3 — Task 1 (`natijaHissiyoti`), Task 6, Task 8.
- §9 kam harakat va qaror 8 — Task 2 (CSS), Task 4 (sinflar), Task 5/8/9 (ildizdagi atribut), Task 6 (konfeti), Dafi rig (mavjud).
- §8 «unit sahifasi ro'yxat EMAS» va qaror 7 — Task 9 (lavha + joylar; eski yassi ro'yxat qoladi).
- §5 shartnoma / qaror 6 — Task 7 (`MukofotFoni`, `UnitLavha`, reyestr testi), Task 10 (ADR-0128, `client/CLAUDE.md`).
- Qaror 5 (Dafi `tetik`) — Task 5. Qaror 9 (`seans-ekrani` faqat yelim) — Task 5, 8 + Global Constraints. Qaror 10 (test haqiqati) — har task + Task 10 Step 7. Qaror 11 (i18n) — Task 3, 8. Qaror 12 (server yo'q) — Global Constraints + Task 10 Step 5.
- **Ataylab chiqarilgan:** eski DiB ekranlari, O'rmon/Dengiz/Nemis temalari, yo'l tugunining silkinishi, `BottomSheet` kam harakati (1-bosqich ro'yxati bo'yicha keyinga).

**2. Placeholder scan:** «TBD/TODO/keyinroq/shunga o'xshash» yo'q; har kod qadamida to'liq kod yoki aniq old→new Edit bor. Ikki shartli ko'rsatma bor va ikkalasi aniq: ADR raqami band bo'lsa qayta raqamlash (Task 10 Step 1), Compiler lint e'tirozida komponentni destrukturlash (Task 8 Step 7, Task 9 Step 5).

**3. Type consistency:** `javobEffekti` → `{ ovoz: "togri"|"xato"; dafi }` (Task 1) — `useJavobSezgisi` da (Task 5). `NatijaHissiyoti { bayram; dafi }` (Task 1) — `NatijaSahnaProps.hissiyot` (Task 8), `MukofotFoniProps.bayram` (Task 7) ga `hissiyot.bayram` beriladi. `panelOhangi(...)` qaytarishi `"togri"|"xato"|null` (Task 1) = `PastkiPanel` `ohang` (Task 4), Task 5 da `ohang={panelOhangi(natija, juftlashRejimi)}`. `SeansChizigi { tugatilgan; jami; className? }` (Task 4) = Task 5 Edit 12. `Dafi tetik?: number` (Task 5) = `sezgi.dafi.tetik`. `KonfetiTuval` (Task 6) — Task 8. `UnitLavhaProps { daraja: DafLevel; matn: string }` (Task 7) — Task 9 `daraja={data.level}` (`LernenUnit.level: DafLevel`). `DARAJA_FONI` (Task 7) — `TozaUnitLavha`, `YopishqoqUnitLavha`. `DARAJA_TONI: Record<string, TugunTone>` (Task 9) — `tugunRangi(tugun, tone)`. `XATO_*` nomlari (Task 3) — vidjetlar va `JavobPaneli`; `JAVOB_FAYLLARI` (Task 3) — Task 8 kengaytiradi. `NatijaEkraniProps.takrorlash` (Task 8) — `SeansEkrani` `takrorlash={!darsMi}`. `useSanaladiganBall` (Task 8, `sanoq.ts`) — `NatijaSahna`.

---

## Pre-flight notes for the controller

1. **Tugma yorlig'i almashmaydi.** duo.html dagi «Tekshirish → Davom etish / Yakunlash» rejalashtirilmagan: «oxirgi savol» `javobBerildi` dan oldin ma'lum emas (xato javob yoki o'rinbosar savol navbatga qo'shilishi mumkin), lug'atdagi «Tekshirish»/«Yakunlash» esa ot ma'nosida band. Yorliqlar «Javobni tekshirish»/«Keyingi» bo'lib qoladi.
2. **Mashqda daraja aksenti yo'q.** duo.html dagi `--uc` (har unit rangi) o'rniga mashq, natija kartalari va konfeti fonida koral ishlatiladi; Lumio `Button` da grape varianti yo'q. Daraja rangi faqat unit sahifasida (lavha, joylar).
3. **`tetik` — hukmlar sanog'i, savol indeksi emas.** Qaror 5 «savol indeksi» degan; sanoq juftlashda ham har juftni qayta o'ynatadi. Dafi har yangi savolda «o'ylayapti» ga qaytgani uchun ketma-ket ikki to'g'ri javob baribir ikki marta bayram qiladi.
4. **Yakuniy sinovni tanish `useLernenLesson` ga bog'liq** (`sinovMi`, `seans-ekrani.tsx` ~750). Dars so'rovi yiqilgan va `abschluss` hali javob bermagan bo'lsa, ekran uni bir lahza oddiy dars deb hisoblab, hukmdan oldin bayram qilishi mumkin. Kamdan-kam; tuzatish seans holati mantig'iga tegardi, shuning uchun rejada yo'q.
5. **Unit «joy» kartalari «Toza» tugun modelidan to'g'ridan-to'g'ri foydalanadi** (shartnoma o'rni emas). O'z unit sahnasi bo'lgan tema (3-bosqich) ularni `UnitLavha` yoki yangi o'ringa ko'chirishi kerak — ADR-0128 «Oqibatlar» da yozilgan.
6. **Qulfli joy faqat `qulf` ovozi beradi, silkinmaydi** (yo'l tugunida ham silkinish yo'q; spec §9 «+ silkinish» deydi).
7. **Kam harakatda o'tishlar darrov yechiladi** (tizim qoidasining aynan nusxasi), spec §9 dagi «qisqa fade» emas.
8. **iOS/Telegram ovoz qulfini ochish** dinamik import orqali (1-bosqich yo'li) — haqiqiy qurilmada tekshirilmagan (ro'yxat 18-band).
9. **Konfeti kadr bo'yicha** (120 kadr): 120 Hz ekranda ~1 s.
10. **Natija ekrani 360×640 telefonda uzun:** katta Dafi (240 px) + kartalar xatolar ro'yxati va tugmalarni pastga suradi (eski ekranda ham tugmalar ro'yxat ostida edi).
11. **Seriya kartasi doim joriy seriyani ko'rsatadi** (eski chip faqat kunning birinchi mashqida chiqardi).
12. **`<tema.MukofotFoni>` / `<tema.UnitLavha>`** JSX a'zo ifodasi sifatida chiziladi; React Compiler lint e'tiroz qilsa, Task 8/9 dagi destrukturlash yo'li bor.
