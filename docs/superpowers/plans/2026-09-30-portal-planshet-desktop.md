# Student Portal on Tablet and Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web student portal read well on a touch tablet and a desktop: named rail icons, a 2×2 Asosiy, centred narrow screens, and Ta'lim screens that say "offline" instead of "failed".

**Architecture:** Four small, independent client changes on existing primitives: `RailNavItem` in `lumio/side-rail.tsx` (label always rendered, placed under the icon at 72px); `Screen narrow` becomes `md:mx-auto md:max-w-[600px]` and more screens opt in; Asosiy wraps its four blocks in one `lg:grid-cols-2` grid with fixed cells; the four Ta'lim components decide with the existing `loadState` + `LoadFailed`. No rail geometry constant changes, no server change.

**Tech Stack:** Next.js 16 (app router), React 19, Tailwind v4, React Query v5, zustand, Vitest (node, static render), Playwright-core (headless check only, outside the repo).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-30-portal-planshet-desktop-design.md` (approved 30.09.2026, variant C).
- Client only. Do not touch `server/`, `student-app/`, or `client/src/components/student-portal/lib/sidebar-store.ts` (open PR #609 edits it; rail width stays 72px / 240px).
- Phone layout (< 768px) must render exactly as today.
- UI text is Uzbek, Latin script only. New code comments, commit messages and the PR are English.
- Do not run Prettier on `client/` files (no Prettier config there; it rewrites unrelated formatting).
- Tests: `cd client && npm test -- <path>` (`vitest run`). If vitest refuses its config loader, use `npx vitest --config vitest.config.mts run <path>`.
- Lint gate: `npx eslint src` must report 0 errors (read the `✖ N problems (X errors, Y warnings)` line).
- Project rule (client/CLAUDE.md "Skill Usage Rule"): before editing UI components invoke the `frontend-design` and `.claude/worktrees/portal-planshet-desktop/client:vercel-react-best-practices` skills.
- Work only inside `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/portal-planshet-desktop`; `SCRATCH=/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/46ad3971-db9e-4281-8e2f-cddb337abcdf/scratchpad`.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Worktree setup, browser harness, "before" screenshots

**Files:**
- Create (outside repo): `$SCRATCH/portal-check/mock.mjs`, `$SCRATCH/portal-check/check.mjs`

**Interfaces:**
- Produces: mock API on `127.0.0.1:4112` (prefix `/api`), `next dev` on `localhost:3112`, `node check.mjs shots <label>` (PNGs into `$SCRATCH/portal-check/<label>/`) and `node check.mjs assert` (exit 1 on any failed case). Task 7 reuses all of it.

- [ ] **Step 1: Install client dependencies and run the portal suite as a baseline**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/portal-planshet-desktop/client
npm ci
npm test -- src/components/student-portal
```
Expected: all tests PASS (baseline on `origin/main`).

- [ ] **Step 2: Write the mock API** — `$SCRATCH/portal-check/mock.mjs` (invented data only)

```js
import http from "node:http";

const PORT = 4112;
const ORIGIN = "http://localhost:3112";
const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const teacher = { id: 10311, firstName: "Dilnoza", lastName: "Rahimova" };
const room = { id: 3, name: "2-xona" };
const group = {
  id: 501, enrollmentId: 9001, name: "A1-12", status: "ACTIVE",
  course_name: "Nemis tili A1", days: null, exactDays: ALL_DAYS,
  lessonStartTime: "14:00", lessonEndTime: "15:30",
  startDate: "2026-09-01", endDate: null, room, teachers: [teacher], enrolledAt: "2026-09-01",
};
const profile = {
  id: 10042, firstName: "Aziza", lastName: "Karimova", phone: "998901234567",
  extraPhone: null, parentPhone: null, parentName: null, telegram: null, photo: null,
  balance: 450000, status: "ACTIVE", login: "aziza", date_of_birth: "2008-05-14",
  address: null, branches: [{ id: 1, name: "Chilonzor" }], groups: [group],
};
const stats = { total: 25, present: 23, absent: 2, late: 0, excused: 0, percentage: 92 };
const dates = ["2026-09-28", "2026-09-25", "2026-09-23", "2026-09-21", "2026-09-18", "2026-09-16"];
const history = [{
  groupId: 501, groupName: "A1-12", courseName: "Nemis tili A1", lessonTime: "14:00", stats,
  records: dates.map((date, i) => ({ date, status: i === 2 ? "ABSENT" : "PRESENT", note: null })),
}];
const schedule = [{
  groupId: 501, groupName: "A1-12", courseName: "Nemis tili A1",
  exactDays: ["monday", "wednesday", "friday"], lessonStartTime: "14:00", lessonEndTime: "15:30",
  startDate: "2026-09-01", endDate: null, teachers: [teacher], room,
}];

const ROUTES = {
  "GET /api/student-portal/onboarding": { missing: [], phoneVerified: true },
  "GET /api/student-portal/profile": profile,
  "GET /api/student-portal/attendance/stats": stats,
  "GET /api/student-portal/attendance/history": history,
  "GET /api/student-portal/schedule": schedule,
  "GET /api/student-portal/payments": { payments: [], transactions: [] },
  "GET /api/student-portal/lernen/levels": [],
  "GET /api/student-portal/lernen/reyting": [],
};

http
  .createServer((req, res) => {
    const path = req.url.split("?")[0];
    res.setHeader("Access-Control-Allow-Origin", ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-branch-id, x-portal");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.method === "POST") { console.log("POST", req.url, "204"); res.writeHead(204); res.end(); return; }
    const body = ROUTES[`${req.method} ${path}`];
    console.log(req.method, req.url, body === undefined ? "404" : "200");
    res.writeHead(body === undefined ? 404 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { message: "Topilmadi" }));
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock on ${PORT}`));
```

- [ ] **Step 3: Write the checker** — `$SCRATCH/portal-check/check.mjs`

```js
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/a1111/.npm/_npx/6bcb61ec6d5aea22/node_modules/playwright-core");

const BASE = "http://localhost:3112";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const [mode = "assert", label = "after"] = process.argv.slice(2);

const USER = {
  id: 10042, firstName: "Aziza", lastName: "Karimova", phone: "998901234567", photo: null,
  gender: "female", balance: 450000, companyId: 1001, mainBranch: 1,
  roles: [{ id: 6, name: "Student" }], branches: [{ id: 1, name: "Chilonzor" }],
  company: { id: 1001, name: "DaF Sprachzentrum", subdomain: null, logo: null, phone: null },
  studentId: 10042,
};

async function session(browser, { width, height, rail, theme }) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies([
    { name: "token", value: "dev-token", url: BASE },
    { name: "refreshToken", value: "dev-refresh", url: BASE },
    { name: "user", value: encodeURIComponent(JSON.stringify(USER)), url: BASE },
  ]);
  await context.addInitScript(([r, t]) => {
    localStorage.setItem("daf.portal.sidebar", r);
    localStorage.setItem("theme", t);
  }, [rail, theme]);
  return context;
}

async function open(context, route) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  // A cookie the middleware rejects lands on /login, which has an h1 too.
  if (new URL(page.url()).pathname !== route) throw new Error(`${route} → ${page.url()}`);
  await page.waitForSelector("main h1", { timeout: 90_000 });
  await page.waitForTimeout(700); // entrance animations settle
  return page;
}

// Geometry read in the page; every check returns [name, ok, detail].
const measure = () => {
  const out = [];
  const box = (el) => el && el.getBoundingClientRect();
  const w = window.innerWidth;
  out.push(["no sideways scroll", document.documentElement.scrollWidth <= w, `${document.documentElement.scrollWidth}/${w}`]);

  const main = document.querySelector("main");
  const screen = document.querySelector("main > div");
  const route = location.pathname;
  if (["/portal/schedule", "/portal/attendance", "/portal/settings", "/portal/faq", "/portal/about", "/portal/lernen/reyting"].includes(route) && w >= 768) {
    const m = box(main), s = box(screen);
    const cs = getComputedStyle(main);
    const mid = m.left + parseFloat(cs.paddingLeft) + (m.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 2;
    out.push(["narrow ≤ 600px", s.width <= 600.5, s.width.toFixed(1)]);
    out.push(["narrow centred", Math.abs(s.left + s.width / 2 - mid) <= 1.5, `${(s.left + s.width / 2).toFixed(1)} vs ${mid.toFixed(1)}`]);
  }

  if (route === "/portal") {
    const hero = box([...document.querySelectorAll("main p")].find((p) => p.textContent.trim() === "Balans")?.closest(".clay-coral"));
    const att = box(document.querySelector('main a[href="/portal/attendance"]'));
    const h2 = (t) => [...document.querySelectorAll("main h2")].find((h) => h.textContent.trim() === t)?.closest(".lumio-fade-up");
    const lessons = box(h2("Bugungi darslar"));
    const groups = box(h2("Guruhlarim"));
    if (w >= 1024) {
      out.push(["2x2: Balans and Davomat on one row", Math.abs(hero.top - att.top) <= 1 && hero.right < att.left, `${hero.top}/${att.top}`]);
      out.push(["2x2: row 1 same height", Math.abs(hero.height - att.height) <= 1, `${hero.height}/${att.height}`]);
      out.push(["2x2: lessons under Balans, groups under Davomat", lessons.top > hero.bottom && Math.abs(lessons.left - hero.left) <= 1 && Math.abs(groups.left - att.left) <= 1 && Math.abs(lessons.top - groups.top) <= 1, `${lessons.left}/${groups.left}`]);
    } else {
      out.push(["one column in phone order", hero.top < att.top && att.top < lessons.top && lessons.top < groups.top && Math.abs(hero.width - lessons.width) <= 1, `${hero.top}<${att.top}<${lessons.top}<${groups.top}`]);
    }
  }

  const rail = document.querySelector("aside");
  if (rail && getComputedStyle(rail).display !== "none") {
    const r = box(rail);
    const rows = [...rail.querySelectorAll("nav a")].map((a) => {
      const s = a.querySelector("span:not([aria-hidden])");
      const b = box(s);
      return s && b.width > 0 && b.height > 0 && s.scrollWidth <= s.clientWidth && b.left >= r.left && b.right <= r.right;
    });
    out.push(["rail: 7 rows, every name visible and whole", rows.length === 7 && rows.every(Boolean), rows.join(",")]);
  }
  return out;
};

const SHOTS = [
  ["asosiy-1440", "/portal", 1440, 900, "expanded"],
  ["jadval-1440", "/portal/schedule", 1440, 900, "expanded"],
  ["davomat-1440", "/portal/attendance", 1440, 900, "expanded"],
  ["menyu-768", "/portal", 768, 1024, "collapsed"],
  ["asosiy-375", "/portal", 375, 812, "collapsed"],
];

const browser = await chromium.launch();
let failed = 0;
try {
  if (mode === "shots") {
    fs.mkdirSync(path.join(HERE, label), { recursive: true });
    for (const [name, route, width, height, rail] of SHOTS) {
      const context = await session(browser, { width, height, rail, theme: "light" });
      const page = await open(context, route);
      await page.screenshot({ path: path.join(HERE, label, `${name}.png`), fullPage: true });
      await context.close();
      console.log("shot", name);
    }
  } else {
    const ROUTES = ["/portal", "/portal/schedule", "/portal/attendance", "/portal/settings", "/portal/faq", "/portal/about", "/portal/lernen", "/portal/lernen/reyting"];
    for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900]]) {
      for (const rail of ["collapsed", "expanded"]) {
        for (const theme of ["light", "dark"]) {
          const context = await session(browser, { width, height, rail, theme });
          for (const route of ROUTES) {
            const page = await open(context, route);
            for (const [name, ok, detail] of await page.evaluate(measure)) {
              if (!ok) failed++;
              console.log(`${ok ? "PASS" : "FAIL"} ${width} ${rail} ${theme} ${route} — ${name} (${detail})`);
            }
          }
          await context.close();
        }
      }
    }
    // Ta'lim with no connection: React Query pauses the request; the page must say so.
    const context = await session(browser, { width: 1440, height: 900, rail: "expanded", theme: "light" });
    const page = await open(context, "/portal");
    await page.evaluate(() => { window.dispatchEvent(new Event("offline")); window.next.router.push("/portal/lernen"); });
    const offline = await page.waitForSelector("text=Internet aloqasi yo'q", { timeout: 60_000 }).then(() => true, () => false);
    const retry = (await page.locator("text=Qayta urinish").count()) > 0;
    const ok = offline && !retry;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} 1440 Ta'lim offline — says "Internet aloqasi yo'q", no retry (${offline}/${retry})`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `FAILED: ${failed}` : "ALL PASS");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Start the mock and the dev server** (Bash `run_in_background: true` for each; no `sleep`)

```bash
node $SCRATCH/portal-check/mock.mjs
```
```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/portal-planshet-desktop/client
NEXT_PUBLIC_API_URL=http://127.0.0.1:4112/api NEXT_PUBLIC_TELEGRAM_BOT=fake_bot PORT=3112 npm run dev
```
Expected: mock prints `mock on 4112`; Next prints `Ready`. Wait for readiness with a Monitor until-loop on `curl -s -o /dev/null -w '%{http_code}' http://localhost:3112/login` returning `200`.

- [ ] **Step 5: Take the "before" screenshots**

```bash
node $SCRATCH/portal-check/check.mjs shots before
```
Expected: five `shot …` lines; PNGs in `$SCRATCH/portal-check/before/`. If `main h1` never appears, open `before/` is empty: check the mock log for a 404 on a route the shell calls and add it to `ROUTES`.

- [ ] **Step 6: Record the harness baseline** — `node $SCRATCH/portal-check/check.mjs assert`
Expected: FAIL lines for the narrow-centred, 2x2, rail-name and Ta'lim-offline checks (this is the bug being fixed); every "no sideways scroll" PASS. Keep the servers running for Task 7.

---

### Task 2: Ta'lim screens say "offline" instead of "failed"

**Files:**
- Modify: `client/src/components/student-portal/student-portal-load-states.test.ts`
- Modify: `client/src/components/student-portal/lernen/lernen-levels-page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-unit-page.tsx`
- Modify: `client/src/components/student-portal/lernen/lernen-lesson-page.tsx`
- Modify: `client/src/components/student-portal/lernen/reyting/reyting-ekrani.tsx`
- Modify: `client/CLAUDE.md` (load-state rule), `docs/student-portal-ux-audit.md` (U4)

**Interfaces:**
- Consumes: `loadState(query): "ready" | "offline" | "failed" | "loading"` (`lib/load-state.ts`), `LoadFailed({ query: { isPaused, refetch } })` (`load-failed.tsx`). Query keys: `["lernen","levels"]`, `["lernen","unit",id]`, `["lernen","lesson",id]`, `["lernen","reyting",scope]`, `["lernen","fortschritt"]`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests** — in `student-portal-load-states.test.ts` add imports after line 21 and the block at the end of the file

```ts
import { LernenLevelsPage } from "./lernen/lernen-levels-page";
import { LernenUnitPage } from "./lernen/lernen-unit-page";
import { LernenLessonPage } from "./lernen/lernen-lesson-page";
import { ReytingEkrani } from "./lernen/reyting/reyting-ekrani";
```

```ts
const LEVELS = ["lernen", "levels"];
const UNIT = ["lernen", "unit", 7];
const LESSON = ["lernen", "lesson", 9];
const RANKING = ["lernen", "reyting", "gruppe"];

function UnitPage() {
  return createElement(LernenUnitPage, { unitId: 7 });
}

function LessonPage() {
  return createElement(LernenLessonPage, { lessonId: 9 });
}

// Ta'lim decided with `isError || !data`, so offline — a paused query, neither
// loading nor failed — fell into the error branch: "…yuklab bo'lmadi" and a
// retry button that could do nothing until the connection came back.
describe("a Ta'lim screen", () => {
  it.each([
    ["the path", LernenLevelsPage],
    ["a unit", UnitPage],
    ["a lesson", LessonPage],
    ["the ranking", ReytingEkrani],
  ] as const)("opened with no connection says so, with no button (%s)", async (_name, page) => {
    const text = await render(page, [], { offline: true });
    expect(text).toContain("Internet aloqasi yo'q");
    expect(text).not.toContain("Qayta urinish");
  });

  it.each([
    ["the path", LernenLevelsPage, LEVELS],
    ["a unit", UnitPage, UNIT],
    ["a lesson", LessonPage, LESSON],
    ["the ranking", ReytingEkrani, RANKING],
  ] as const)("whose request failed offers a retry (%s)", async (_name, page, key) => {
    const text = await render(page, [[key, FAILED]]);
    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
  });

  it("keeps the path it already had when a refresh fails", async () => {
    const text = await render(LernenLevelsPage, [[LEVELS, new RefreshFailed([])]]);
    expect(text).toContain("O'quv yo'li hali tayyor emas");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });

  it("shows the ranking's own empty state for an empty answer", async () => {
    const text = await render(ReytingEkrani, [[RANKING, []]]);
    expect(text).toContain("Siz hali guruhga qo'shilmagansiz");
    expect(text).not.toContain("Ma'lumotni yuklab bo'lmadi");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npm test -- src/components/student-portal/student-portal-load-states.test.ts`
Expected: FAIL — the four "opened with no connection" cases (old copy «…yuklab bo'lmadi»), and "whose request failed" for a unit, a lesson and the ranking (no «Qayta urinish» / other title). The path's failed case, refresh and empty cases already pass.

- [ ] **Step 3: `lernen-levels-page.tsx`** — drop `Button` from the `../lumio` import, add the two imports, and change the query and the first two branches

```tsx
import { useLernenLevels } from "./queries";
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
```

```tsx
export function LernenLevelsPage() {
  const query = useLernenLevels();
  const { data } = query;
  const yolBosh = data != null && data.length === 0;
```

```tsx
      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        // Past "loading", no data means offline or failed — LoadFailed says
        // which; offline the request resumes by itself, so no button.
        <LoadFailed query={query} />
      ) : yolBosh ? (
```

- [ ] **Step 4: `lernen-unit-page.tsx`** — add the imports after `import { useLernenUnit } from "./queries";`, replace the query line, replace the loading/error branches

```tsx
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
```

```tsx
  const query = useLernenUnit(unitId);
  const { data } = query;
```

```tsx
      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : boshMi ? (
```

- [ ] **Step 5: `lernen-lesson-page.tsx`** — `BookOpen` and `EmptyState` become unused: the phosphor import becomes `import { SpeakerHigh, Trophy } from "@phosphor-icons/react";`, remove `EmptyState,` from the `../lumio` import, add the two imports after `import { useLernenLesson } from "./queries";`

```tsx
import { loadState } from "../lib/load-state";
import { LoadFailed } from "../load-failed";
```

```tsx
  const query = useLernenLesson(lessonId);
  const { data } = query;
```

```tsx
      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : stage === "drill" ? (
```

- [ ] **Step 6: `reyting/reyting-ekrani.tsx`** — delete `ReytingXatosi` (lines 31-45) and its now-unused imports (`WarningCircle`, `Button`); add the imports; change both consumers

```tsx
import { Trophy, UsersThree } from "@phosphor-icons/react";
```
(remove `Button,` from the `../../lumio` import list)
```tsx
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";
```

```tsx
function ReytingJadvali({ scope }: { scope: "gruppe" | "zentrum" }) {
  const query = useReyting(scope);
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={4} />;
  if (!data) return <LoadFailed query={query} />;
```

```tsx
function DarajamTab() {
  const query = useFortschritt();
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={2} />;
  if (!data) return <LoadFailed query={query} />;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd client && npm test -- src/components/student-portal/student-portal-load-states.test.ts`
Expected: PASS (all old and new cases).

- [ ] **Step 8: Docs**

`client/CLAUDE.md`, section "A request with no answer never renders the empty state", after the `student-portal-load-states.test.ts` bullet add:
```md
- The Ta'lim screens follow the same rule: the path, a unit, a lesson and both ranking tabs. Until 30.09.2026 they decided with `isError || !data`, so offline they said «…yuklab bo'lmadi» and offered a retry that could not work. The path's chips (`YolTepasi`) still hide themselves on any missing answer; they are a side request.
```
`docs/student-portal-ux-audit.md`, U4, after the paragraph that ends «…ma'lumot o'zi yuklandi.» add:
```md
**Ta'lim ham — 2026-09-30.** Yo'l, bo'lim, dars va reyting ekranlari `isError || !data` bilan qaror qilardi: internet yo'q paytda «…yuklab bo'lmadi» va ishlamaydigan «Qayta urinish» chiqardi. Endi ular ham `loadState` + `LoadFailed` da.
```

- [ ] **Step 9: Lint the touched files and commit**

```bash
cd client && npx eslint src/components/student-portal/lernen src/components/student-portal/student-portal-load-states.test.ts
cd .. && git add client/src/components/student-portal client/CLAUDE.md docs/student-portal-ux-audit.md
git commit -m "Student portal: Ta'lim says it is offline instead of failing

The path, unit, lesson and ranking screens decided with isError || !data,
so a paused request (no connection) showed the failure copy and a retry
that could do nothing. They now use loadState + LoadFailed like the rest
of the portal; unit and lesson pages gain a retry on a real failure.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: eslint 0 errors; commit created.

---

### Task 3: The collapsed rail names every icon

**Files:**
- Modify: `client/src/components/student-portal/lumio/side-rail.tsx`
- Modify: `client/src/components/student-portal/student-portal-nav.test.ts`
- Modify: `client/CLAUDE.md` ("Collapsible rail")

**Interfaces:**
- Consumes: `StudentNavItem`, `railNavItems` (`@/lib/student-nav-items`).
- Produces: `export function RailNavItem({ item, active, collapsed }: { item: StudentNavItem; active: boolean; collapsed: boolean })` — one rail row, name always rendered.

- [ ] **Step 1: Write the failing test** — in `student-portal-nav.test.ts` change the nav import to `import { railNavItems, studentNavItems } from "@/lib/student-nav-items";`, add `import { RailNavItem } from "./lumio/side-rail";`, and append

```ts
describe("portal rail on a tablet", () => {
  // A touch tablet has no hover, so the collapsed rail's `title` tooltips
  // never showed: the student saw a column of unnamed icons (review 26.09).
  it.each(railNavItems.map((item) => [item.title, item] as const))(
    "names %s under its icon when collapsed",
    (title, item) => {
      const html = render(() =>
        createElement(RailNavItem, { item, active: false, collapsed: true }),
      );
      expect(html.replace(/&#x27;/g, "'")).toContain(`>${title}</span>`);
    },
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npm test -- src/components/student-portal/student-portal-nav.test.ts`
Expected: FAIL — `RailNavItem` is not exported (element type is invalid / undefined).

- [ ] **Step 3: Implement** — `lumio/side-rail.tsx`

Add the type import:
```tsx
import {
  railNavItems,
  moreRoutes,
  settingsHelpItems,
  type StudentNavItem,
} from "@/lib/student-nav-items";
```
Replace the header comment's second paragraph:
```tsx
// Two widths, driven by `useSidebar`: 240px with each name beside its icon, or
// 72px with the name under it. The 72px rail used to be icons only with a
// `title` tooltip, which a touch tablet never shows — the names must stay on
// screen at every width. Under the pre-hydration `auto` mode the expanded
// markup is rendered at the narrow md width for a single frame —
// `overflow-hidden` on the <aside> is what keeps that frame from showing
// clipped labels.
```
Add above `export function LumioSideRail`:
```tsx
/** One rail row. Exported so a test can draw the collapsed width directly:
 *  a static render only ever sees the sidebar store's initial `auto`. */
export function RailNavItem({
  item,
  active,
  collapsed,
}: {
  item: StudentNavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-md transition-colors",
        collapsed
          ? "flex-col justify-center gap-1 px-1 py-2 text-[11px] leading-tight"
          : "gap-3 px-3 py-2.5 text-sm",
        active
          ? "bg-coral-500/10 font-bold text-coral-600"
          : "font-semibold text-ink-600 hover:bg-tint hover:text-ink-900",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-coral-500"
        />
      )}
      <Icon size={20} weight={active ? "fill" : "bold"} />
      <span className={cn("truncate", collapsed && "max-w-full")}>
        {item.title}
      </span>
    </Link>
  );
}
```
Replace the whole `<nav>` block:
```tsx
        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {railNavItems.map((item) => (
            <RailNavItem
              key={item.url}
              item={item}
              active={isActive(item.url)}
              collapsed={collapsed}
            />
          ))}
        </nav>
```
Profile link — collapsed layout stacks the avatar over a «Profil» label:
```tsx
          className={cn(
            "flex items-center rounded-card border border-line bg-surface shadow-lumio-sm transition-colors hover:bg-tint",
            collapsed ? "flex-col justify-center gap-1 p-2" : "gap-3 px-3 py-2.5",
            pathname.startsWith("/portal/profile") && "border-coral-500/40",
          )}
        >
          <Avatar
            src={profile?.photo}
            name={profile ? fullName : undefined}
            size={40}
          />
          {collapsed ? (
            <span className="text-[11px] font-bold leading-tight text-ink-600">
              Profil
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-bold text-ink-900">
                  {fullName}
                </span>
                <span className="block text-xs font-semibold text-ink-500">
                  Profilni ko&apos;rish
                </span>
              </span>
              <CaretRight size={16} weight="bold" className="text-ink-400" />
            </>
          )}
        </Link>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npm test -- src/components/student-portal/student-portal-nav.test.ts`
Expected: PASS (7 new cases + existing).

- [ ] **Step 5: Docs** — `client/CLAUDE.md`, "Collapsible rail": replace the first sentence's `the rail has two widths, 72px icons-only and 240px with labels,` with `the rail has two widths — 72px with each name under its icon, 240px with the name beside it —`, and add a bullet at the end of that list:
```md
- **The 72px rail keeps its names.** It used to be icons only with a `title` tooltip, and a touch tablet never shows a tooltip. `RailNavItem` draws one row at either width and always renders the name; test it with `collapsed` as a prop, because a static render only sees the store's initial `auto`.
```

- [ ] **Step 6: Lint and commit**

```bash
cd client && npx eslint src/components/student-portal/lumio/side-rail.tsx src/components/student-portal/student-portal-nav.test.ts
cd .. && git add client/src/components/student-portal client/CLAUDE.md
git commit -m "Student portal rail: name every icon when collapsed

At 72px the rail showed icons with a title tooltip only, which a touch
tablet never displays. Each row now carries its name under the icon; the
width stays 72px, so no rail geometry changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Narrow screens sit in the middle; Jadval, Davomat, FAQ and About join them

**Files:**
- Create: `client/src/components/student-portal/student-portal-wide-screens.test.ts`
- Modify: `client/src/components/student-portal/lumio/screen.tsx:8-31`
- Modify: `client/src/components/student-portal/student-schedule-view.tsx:84,95,103,173`
- Modify: `client/src/components/student-portal/student-attendance-history.tsx:109`
- Modify: `client/src/components/student-portal/student-faq-page.tsx:28`
- Modify: `client/src/components/student-portal/student-about-page.tsx:8`
- Modify: `client/CLAUDE.md` (Lumio design system, `Screen` bullet)

**Interfaces:**
- Produces: `Screen narrow` = `md:mx-auto md:max-w-[600px]`; test helper `html(page, answers)` in the new test file (Task 5 adds to it).

- [ ] **Step 1: Write the failing tests** — new file `student-portal-wide-screens.test.ts`

```ts
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { Screen } from "./lumio";
import type { StudentScheduleItem } from "./lib/types";
import { StudentScheduleView } from "./student-schedule-view";
import { StudentAttendanceHistory } from "./student-attendance-history";
import { StudentFaqPage } from "./student-faq-page";
import { StudentAboutPage } from "./student-about-page";

/** Markup of a page over a cache that already holds these answers. */
function html(
  page: ComponentType,
  answers: ReadonlyArray<readonly [QueryKey, unknown]> = [],
): string {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  for (const [key, data] of answers) client.setQueryData(key, data);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(page)),
  );
}

const NARROW = "md:max-w-[600px]";

const schedule: StudentScheduleItem[] = [
  {
    groupId: 501,
    groupName: "A1-12",
    courseName: "Nemis tili A1",
    exactDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    lessonStartTime: "14:00",
    lessonEndTime: "15:30",
    startDate: "2026-09-01",
    endDate: null,
    teachers: [],
    room: null,
  },
];

describe("a narrow portal screen on a wide display", () => {
  // Settings and Profile sat against the left edge of the 980px column with
  // the rest of it empty (review 26.09).
  it("sits in the middle of the column", () => {
    const markup = renderToStaticMarkup(createElement(Screen, { narrow: true }));
    expect(markup).toContain("md:mx-auto");
    expect(markup).toContain(NARROW);
  });

  // Rows stretched to 916px: a date at one edge, its status at the other.
  it.each([
    ["Jadval", StudentScheduleView, [[["student-portal", "schedule"], schedule]]],
    ["Davomat", StudentAttendanceHistory, [[["student-portal", "attendance-history"], []]]],
    ["FAQ", StudentFaqPage, []],
    ["Biz haqimizda", StudentAboutPage, []],
  ] as const)("%s uses the narrow column", (_title, page, answers) => {
    expect(html(page, answers)).toContain(NARROW);
  });

  // With one lesson a day, the lesson sat in the left half of a two-column
  // grid and nothing beside it.
  it("Jadval lists a day's lessons in one column", () => {
    expect(
      html(StudentScheduleView, [[["student-portal", "schedule"], schedule]]),
    ).not.toContain("lg:grid-cols-2");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npm test -- src/components/student-portal/student-portal-wide-screens.test.ts`
Expected: FAIL — no `md:mx-auto`; Jadval/Davomat/FAQ/About lack `md:max-w-[600px]`; Jadval still has `lg:grid-cols-2`.

- [ ] **Step 3: Implement**

`lumio/screen.tsx`:
```tsx
export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Caps the column at a comfortable reading width from md up and centres it.
   * The shell gives every screen up to 720/980px; text-and-rows screens look
   * stretched at that width, and a capped column left against the left edge
   * leaves the rest of the row empty.
   */
  narrow?: boolean;
}
```
```tsx
        narrow && "md:mx-auto md:max-w-[600px]",
```
`student-schedule-view.tsx`: the three `<Screen>` (lines 84, 95, 103) become `<Screen narrow>`; line 173 `<div className="grid gap-2.5 lg:grid-cols-2">` becomes `<div className="grid gap-2.5">`.
`student-attendance-history.tsx:109`, `student-faq-page.tsx:28`, `student-about-page.tsx:8`: `<Screen>` → `<Screen narrow>`.

- [ ] **Step 4: Run to verify pass**

Run: `cd client && npm test -- src/components/student-portal`
Expected: PASS (new file + every existing portal test).

- [ ] **Step 5: Docs** — `client/CLAUDE.md`, Lumio design system bullet starting "`Screen` takes `narrow`": replace it with
```md
- `Screen` takes `narrow` (`md:mx-auto md:max-w-[600px]`): the column is capped at a reading width and centred. Jadval, Davomat, Sozlamalar, Profil, FAQ, Biz haqimizda and the Ta'lim inner screens use it. To'lovlar (two columns), Radio (station grid) and Asosiy (2×2) stay wide. `StackHeader`'s back chevron is mobile-only — from md up the student navigates from the rail, and `/portal/more` is not on it.
```

- [ ] **Step 6: Lint and commit**

```bash
cd client && npx eslint src/components/student-portal
cd .. && git add client/src/components/student-portal client/CLAUDE.md
git commit -m "Student portal: narrow screens sit in the middle of the column

Screen narrow now centres its 600px column. Jadval, Davomat, FAQ and
About join Settings, Profile and the Ta'lim inner screens; Jadval lists
a day's lessons in one column instead of half a two-column grid.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Asosiy is a 2×2 dashboard from lg

**Files:**
- Modify: `client/src/components/student-portal/student-home-page.tsx:117-264`
- Modify: `client/src/components/student-portal/student-portal-wide-screens.test.ts`
- Modify: `client/CLAUDE.md` (key screen components), `docs/student-portal-ux-audit.md` (U2, new U6, phase table)

**Interfaces:**
- Consumes: `html(page, answers)` from Task 4's test file.

- [ ] **Step 1: Write the failing test** — append to `student-portal-wide-screens.test.ts` (add `StudentHomePage` and `StudentProfile` imports at the top)

```ts
import type { StudentProfile } from "./lib/types";
import { StudentHomePage } from "./student-home-page";
```

```ts
const profile: StudentProfile = {
  id: 10042,
  firstName: "Aziza",
  lastName: "Karimova",
  phone: "998901234567",
  extraPhone: null,
  parentPhone: null,
  parentName: null,
  telegram: null,
  photo: null,
  balance: 450000,
  status: "ACTIVE",
  login: "aziza",
  date_of_birth: null,
  address: null,
  branches: [{ id: 1, name: "Chilonzor" }],
  groups: [
    {
      id: 501,
      enrollmentId: 9001,
      name: "A1-12",
      status: "ACTIVE",
      course_name: "Nemis tili A1",
      days: null,
      exactDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      lessonStartTime: "14:00",
      lessonEndTime: "15:30",
      startDate: "2026-09-01",
      endDate: null,
      room: null,
      teachers: [],
      enrolledAt: "2026-09-01",
    },
  ],
};

const stats = { total: 25, present: 23, absent: 2, late: 0, excused: 0, percentage: 92 };

describe("Asosiy on a wide display", () => {
  const markup = () =>
    html(StudentHomePage, [
      [["student-portal", "profile"], profile],
      [["student-portal", "attendance-stats"], stats],
    ]);

  // One lesson and one group each sat in the left half of their own
  // two-column grid, under a balance card stretched across 980px.
  it("gives each block a fixed cell: Balans | Davomat, Bugungi darslar | Guruhlarim", () => {
    const cells = [...markup().matchAll(/lg:col-start-(\d) lg:row-start-(\d)/g)].map(
      ([, col, row]) => `${col}${row}`,
    );
    expect(cells).toEqual(["11", "21", "12", "22"]);
  });

  it("lists lessons and groups in one column inside their cell", () => {
    expect(markup().match(/lg:grid-cols-2/g)).toHaveLength(1);
  });

  it("keeps the phone's reading order", () => {
    const m = markup();
    const at = (s: string) => m.indexOf(s);
    expect(at(">Balans<")).toBeLessThan(at(">Davomat<"));
    expect(at(">Davomat<")).toBeLessThan(at("Bugungi darslar"));
    expect(at("Bugungi darslar")).toBeLessThan(at("Guruhlarim"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npm test -- src/components/student-portal/student-portal-wide-screens.test.ts`
Expected: FAIL — no `lg:col-start-*` cells; `lg:grid-cols-2` appears twice (lessons and groups).

- [ ] **Step 3: Implement** — in `student-home-page.tsx` wrap the four blocks after `<ScreenHeader …/>` in one grid and give each `FadeIn` its cell

```tsx
      {/* From lg a 2×2 dashboard: Balans | Davomat, Bugungi darslar |
          Guruhlarim. Each block has a fixed cell, so an attendance answer
          that arrives late (or never) leaves its cell empty instead of
          moving the lists up and back down. Below lg this is the phone's
          single column in the same order, with the same gap. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Balance hero */}
        <FadeIn index={0} className="lg:col-start-1 lg:row-start-1">
          <div className="clay-coral overflow-hidden rounded-card bg-coral-500 p-5 text-white lg:h-full">
```
(the hero's inner markup is unchanged)
```tsx
        {/* Attendance summary → full screen */}
        {stats ? (
          <FadeIn index={2} className="lg:col-start-2 lg:row-start-1">
            <Link href="/portal/attendance" className="block lg:h-full">
              <Card className="space-y-3 lg:flex lg:h-full lg:flex-col lg:justify-center">
```
(inner markup unchanged)
```tsx
        {/* Today's lessons → full schedule */}
        <FadeIn index={3} className="lg:col-start-1 lg:row-start-2">
```
and its list `<div className="grid gap-2.5 lg:grid-cols-2">` → `<div className="grid gap-2.5">`
```tsx
        {/* My groups */}
        <FadeIn index={4} className="lg:col-start-2 lg:row-start-2">
```
and its list `<div className="grid gap-2.5 lg:grid-cols-2">` → `<div className="grid gap-2.5">`; close the new `</div>` after the groups `</FadeIn>`, before `</Screen>`.

- [ ] **Step 4: Run to verify pass**

Run: `cd client && npm test -- src/components/student-portal`
Expected: PASS (including `student-portal-load-states.test.ts`, which renders Asosiy too).

- [ ] **Step 5: Docs**

`client/CLAUDE.md`, "Key screen components": `student-home-page.tsx — dashboard (greeting, stats, schedule)` becomes
```md
- `student-home-page.tsx` — dashboard (greeting, balance, attendance, today's lessons, groups). From lg a 2×2 grid with fixed cells (Balans | Davomat / Bugungi darslar | Guruhlarim), so a late or missing attendance answer leaves its cell empty instead of reflowing the page; below lg the phone's single column in the same order.
```
`docs/student-portal-ux-audit.md`:
- U2, after the paragraph ending «…ancha uzun bo'lib ketadi.» add:
```md
**TUZATILDI 2026-09-30** (branch `fix/portal-planshet-desktop`). Asosiy 1024px dan 2×2: Balans | Davomat, Bugungi darslar | Guruhlarim — har blok qat'iy katakda. `Screen narrow` endi 600px ustunni o'rtaga qo'yadi; Jadval, Davomat, FAQ va Biz haqimizda unga o'tdi, Sozlamalar/Profil/Ta'lim ichki sahifalari chapdan o'rtaga ko'chdi. Himoya — `student-portal-wide-screens.test.ts`.
```
- after U5 add:
```md
### U6. Planshetda yon menyu nomsiz edi

72px menyu faqat belgilardan iborat edi, nomlar `title` tooltip'da — barmoq bilan ishlatiladigan planshetda tooltip chiqmaydi. **TUZATILDI 2026-09-30:** har belgi ostida nomi, rasm ostida «Profil»; kenglik o'zgarmadi. Himoya — `student-portal-nav.test.ts` (`RailNavItem`).
```
- phase table row 2: `qisman — U4 bajarildi 2026-09-26` → `qisman — U4 (2026-09-26), U2 va U6 (2026-09-30) bajarildi`; add `U6` to that row's findings cell (`U1, U2, U3, U4, U5, U6`).

- [ ] **Step 6: Lint and commit**

```bash
cd client && npx eslint src/components/student-portal
cd .. && git add client/src/components/student-portal client/CLAUDE.md docs/student-portal-ux-audit.md
git commit -m "Student portal: Asosiy is a 2x2 dashboard on wide screens

From lg the four blocks sit in fixed cells (Balans | Davomat,
Bugungi darslar | Guruhlarim) instead of a single stretched column with
half-empty two-column lists. Phone order and spacing are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Whole-client gates

**Files:** none changed (fix-ups go into the task that caused them).

- [ ] **Step 1: Type check** — `cd client && npx tsc --noEmit` → exit 0.
- [ ] **Step 2: Lint** — `npx eslint src 2>&1 | tail -3` → `0 errors` (warnings in untouched files are pre-existing).
- [ ] **Step 3: Full test suite** — `npm test` → all PASS.
- [ ] **Step 4: Production build** — `npm run build` → exit 0. (The dev server from Task 1 may keep running; `next build` writes `.next` too — if it errors on a locked/stale `.next`, stop the dev server first and restart it after the build.)

---

### Task 7: Browser matrix and "after" screenshots

**Files:** none in the repo.

- [ ] **Step 1: Confirm both servers still answer** — `curl -s -o /dev/null -w '%{http_code}' http://localhost:3112/login` → `200`; `curl -s http://127.0.0.1:4112/api/student-portal/onboarding` → JSON. Restart per Task 1 Step 4 if not.
- [ ] **Step 2: Run the matrix** — `node $SCRATCH/portal-check/check.mjs assert`
Expected: last line `ALL PASS` (4 widths × 2 rail modes × 2 themes × 8 routes, plus Ta'lim offline). Any FAIL: fix the code in the matching task's files, re-run that task's tests, amend nothing — add a new commit.
- [ ] **Step 3: "After" screenshots** — `node $SCRATCH/portal-check/check.mjs shots after`
- [ ] **Step 4: Show the user** — send `before/` and `after/` pairs (asosiy-1440, jadval-1440, davomat-1440, menyu-768, asosiy-375) with SendUserFile, one short caption each.
- [ ] **Step 5: Stop and clean up** — stop the dev server and the mock (TaskStop), then `git checkout -- client/AGENTS.md` if `next dev` rewrote it, and `git status --short` shows only the plan's intended files (no `.claude/launch.json`, no screenshots).

---

### Task 8: Pull request

- [ ] **Step 1: Check what `main` gained meanwhile** — `git fetch origin && git log --oneline HEAD..origin/main -- client/`; if PR #609 or others touched the same files, merge `origin/main` into the branch, resolve (keep both texts in `client/CLAUDE.md`), re-run Task 6.
- [ ] **Step 2: Push and open the PR** (English; public repo — invented data only, no production ids)

```bash
git push -u origin fix/portal-planshet-desktop
gh pr create --base main --head fix/portal-planshet-desktop \
  --title "Student portal: tablet and desktop layout" \
  --body "<summary of the four changes, tests, browser matrix result, client-only deploy note, and the Claude Code footer>"
```
The body must list: rail names at 72px (no width change); Asosiy 2×2 with fixed cells; `Screen narrow` centred + Jadval/Davomat/FAQ/About; Ta'lim on `loadState`; tests added; matrix `ALL PASS`; "Client only — deploy = Vercel + move the five aliases"; end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Bind the PR** — ccd_pr `get_status`, then `bind_pr` if it is not reported; read CI once it reports.
- [ ] **Step 4: Tell the user** — the site has not changed yet; the CEO merges the PR, then Task 9 ships it.

---

### Task 9: After the CEO merges — ship to the site

- [ ] **Step 1: Pre-check** — from a fresh worktree at `origin/main` with `client/.vercel` copied in: compare the live deployment's source (`vercel api /v6/deployments/<live dpl id>/files`) with `origin/main` — expected differences only in this PR's files (plus anything merged after the last deploy: list it and say so before shipping).
- [ ] **Step 2: Deploy** — `cd client && vercel --prod --yes`; note the new deployment host and id.
- [ ] **Step 3: Move the five domains** — for `admin lehrer student form invoice`: `vercel api /v2/deployments/<dpl-id>/aliases -X POST --input body.json` with `{"alias":"<name>.dafzentrum.uz"}`; confirm with `vercel inspect <name>.dafzentrum.uz` (id = the new one).
- [ ] **Step 4: Live check** — fetch `https://student.dafzentrum.uz/portal` with a placeholder `token` cookie, grep its `/_next/static/immutable/chunks/*.js` for `md:mx-auto md:max-w-[600px]` and `lg:col-start-2 lg:row-start-1`.
- [ ] **Step 5: Report in plain Uzbek** — what changed for the student, that open tabs need a refresh, and the rollback host.
