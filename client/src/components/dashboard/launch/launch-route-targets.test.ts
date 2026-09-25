import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_EXTRAS, LAUNCH_STATIONS, type LaunchStation } from "./launch-stations";

/**
 * `launch-targets.test.ts` only checks that every `data-tour` id exists
 * SOMEWHERE under `components/` — it does not check that the station's own
 * `route()` actually renders the page holding it. That gap is exactly how the
 * "Xona" station shipped pointing at `/settings/rooms/${id}` (the single-room
 * detail page, `RoomDetailClient`) while `room-add` lives on the branch's room
 * LIST page — clicking the station's button never showed the spotlight.
 *
 * This test walks the real App Router file tree: for every station/extra with
 * `targets`, it builds the route with a sample branch id, maps that route to
 * the page file under `client/src/app/(dashboard)` (numeric segments become
 * `[id]`, the query string is dropped — a route is a path plus a query, and
 * only the path selects a page file), and follows imports from there (depth
 * ≤ 3) looking for one of the station's `data-tour` ids: both `@/components/...`
 * imports AND relative (`./`, `../`) ones. Sibling components in this codebase
 * import each other by relative path (e.g. `salary-client.tsx` pulls in
 * `salary-monthly-view.tsx` via `"./salary-monthly-view"`), so an
 * `@/components/...`-only walk loses the target two hops in — it flagged
 * `teacherRates` and `leadSection` as broken when both routes render fine.
 * `@/hooks/...` and `@/lib/...` imports are still not followed — the goal is
 * the rendered component tree, not every module a page happens to touch.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..");
const APP_DASHBOARD_ROOT = join(SRC_ROOT, "app", "(dashboard)");
const SAMPLE_BRANCH_ID = 7;
const MAX_DEPTH = 3;

function routeToPageFile(route: string): string {
  const pathOnly = route.split(/[?#]/)[0];
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? "[id]" : segment));
  return join(APP_DASHBOARD_ROOT, ...segments, "page.tsx");
}

/** `@/components/...` and relative (`./`, `../`) import specifiers, in source order. */
function componentImportSpecifiers(source: string): string[] {
  const re = /from\s+["'](@\/components\/[^"']+|\.\.?\/[^"']+)["']/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

/** Resolves an import specifier found in `fromDir` to a source file, if one exists. */
function resolveComponentImport(specifier: string, fromDir: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC_ROOT, specifier.slice(2))
    : join(fromDir, specifier);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ];
  return candidates.find(existsSync) ?? null;
}

/** Page source + every matching import reachable within `maxDepth` hops. */
function collectReachableSources(entryFile: string, maxDepth: number): string[] {
  const visited = new Set<string>();
  const sources: string[] = [];

  function visit(file: string, depth: number) {
    if (visited.has(file)) return;
    visited.add(file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return;
    }
    sources.push(text);
    if (depth >= maxDepth) return;
    const dir = dirname(file);
    for (const specifier of componentImportSpecifiers(text)) {
      const resolved = resolveComponentImport(specifier, dir);
      if (resolved) visit(resolved, depth + 1);
    }
  }

  visit(entryFile, 0);
  return sources;
}

function hasOneOfTheTargets(sources: string[], targets: string[]): boolean {
  return sources.some((src) => targets.some((t) => src.includes(`data-tour="${t}"`)));
}

describe("launch station route reaches its own data-tour target", () => {
  const stations: LaunchStation[] = [...LAUNCH_STATIONS, ...LAUNCH_EXTRAS].filter(
    (s) => s.targets.length > 0,
  );

  it.each(stations.map((s): [string, LaunchStation] => [s.key, s]))(
    "%s",
    (_key, station) => {
      const route = station.route(SAMPLE_BRANCH_ID);
      const pageFile = routeToPageFile(route);
      const sources = collectReachableSources(pageFile, MAX_DEPTH);
      expect(hasOneOfTheTargets(sources, station.targets)).toBe(true);
    },
  );
});
