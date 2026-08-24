import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * The dashboard layout has two halves and only one of them resets on a branch
 * switch.
 *
 * `BranchScopedMain` re-keys `<main>`, so every page inside it remounts and its
 * mount-time fetches run again — that is what covers the ~47 components that
 * fetch with `useState` + `useEffect`. The HEADER and SIDEBAR deliberately stay
 * mounted: the branch switcher lives there and must not unmount itself
 * mid-selection.
 *
 * Anything in that outer half which fetches therefore keeps showing the
 * previous branch's data until something else clears it. The global search
 * dropdown did exactly that — search in Fargona, switch to Namangan, and the
 * list still offered Fargona's students.
 *
 * So: every module reachable from the header or the sidebar that talks to the
 * API must either react to the switch (`useBranchChange`) or be listed below as
 * branch-independent, with the reason. Sibling of
 * `branch-scoped-stores.test.ts`, which does the same job for zustand stores.
 */

const ROOT = join(__dirname, "..");
const ENTRY_POINTS = [
  "components/dashboard-header.tsx",
  "components/app-sidebar.tsx",
];

/**
 * Modules that fetch but hold nothing a branch switch could invalidate.
 * Add here ONLY with a reason that survives reading.
 */
const BRANCH_INDEPENDENT: Record<string, string> = {
  "hooks/use-branch-switcher.ts":
    "Fetches the branch LIST, i.e. the switcher itself. Resetting it on a " +
    "switch would clear the control the user just used.",
  "hooks/use-notifications.ts":
    "Notifications are addressed to a person: the server filters by userId " +
    "alone (notifications.service.ts), with no branch in the query.",
  "hooks/use-push-notifications.ts":
    "Registers this DEVICE for push. Device tokens belong to the browser, " +
    "not to a branch.",
};

function resolveImport(spec: string): string | null {
  const base = join(ROOT, spec.replace(/^@\//, ""));
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module reachable from the entry points, with its source. */
function collectReachable(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (file: string | null) => {
    if (!file || out.has(file)) return;
    const source = readFileSync(file, "utf8");
    out.set(file, source);
    for (const match of source.matchAll(/from ["'](@\/[^"']+)["']/g)) {
      walk(resolveImport(match[1]));
    }
  };
  for (const entry of ENTRY_POINTS) walk(join(ROOT, entry));
  return out;
}

const relative = (file: string) => file.slice(ROOT.length + 1);

/**
 * A CALL, not a mention. Matching the bare name would let an unused import
 * satisfy the check — which is precisely the shape a half-finished refactor
 * leaves behind, and the failure this file exists to catch.
 */
const CALLS_USE_BRANCH_CHANGE = /useBranchChange\s*\(/;

describe("components outside BranchScopedMain", () => {
  const reachable = collectReachable();

  const fetchers = [...reachable.entries()]
    .filter(([, source]) => /from ["']@\/lib\/api["']/.test(source))
    .map(([file, source]) => ({ file: relative(file), source }));

  it("reaches a meaningful part of the tree (the walk itself works)", () => {
    // A broken resolver would make every assertion below vacuously true.
    expect(reachable.size).toBeGreaterThan(20);
    expect(fetchers.length).toBeGreaterThan(0);
  });

  it("every fetcher either reacts to a branch switch or is declared independent", () => {
    const unaccounted = fetchers
      .filter(({ source }) => !CALLS_USE_BRANCH_CHANGE.test(source))
      .map(({ file }) => file)
      .filter((file) => !(file in BRANCH_INDEPENDENT));

    expect(unaccounted).toEqual([]);
  });

  it("keeps the independence list honest — no entry for a module that left", () => {
    const names = new Set(fetchers.map((f) => f.file));
    const stale = Object.keys(BRANCH_INDEPENDENT).filter((f) => !names.has(f));
    expect(stale).toEqual([]);
  });

  it("still sees the global search, which is the case that motivated this", () => {
    const search = fetchers.find((f) => f.file === "hooks/use-global-search.ts");
    expect(search).toBeDefined();
    expect(search!.source).toMatch(CALLS_USE_BRANCH_CHANGE);
  });
});
