import { readFileSync } from "fs";
import { join } from "path";
import { runInThisContext } from "vm";
import ts from "typescript";
import { makeCan, type Can } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * Tests only: loads the SERVER's capability catalog so client tests build
 * `can` from the same defaults the server uses — the proof that a role sees
 * the same menus as before. The server is a separate package, so its two
 * plain-data files are transpiled on the fly (`status-config.test.ts` reads
 * server code the same way, as text).
 */
const SERVER_SRC = join(__dirname, "../../../server/src");

function load(
  relativePath: string,
  deps: Record<string, unknown>,
): Record<string, unknown> {
  const source = readFileSync(join(SERVER_SRC, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const exports: Record<string, unknown> = {};
  const requireDep = (id: string) => {
    if (!(id in deps)) {
      throw new Error(`server-catalog: unexpected import "${id}"`);
    }
    return deps[id];
  };
  // This realm, so the Sets and arrays it returns compare like local ones.
  const moduleFn = runInThisContext(
    `(function (exports, require) {\n${outputText}\n})`,
  ) as (exports: Record<string, unknown>, require: (id: string) => unknown) => void;
  moduleFn(exports, requireDep);
  return exports;
}

export interface ServerCatalog {
  PERMISSION_KEYS: string[];
  defaultKeysForRoles: (roleIds: readonly number[]) => Set<string>;
}

let cached: ServerCatalog | null = null;

export function loadServerCatalog(): ServerCatalog {
  if (!cached) {
    const roleIds = load("common/auth/role-ids.ts", {});
    cached = load("common/permissions/permission-catalog.ts", {
      "../auth/role-ids": roleIds,
    }) as unknown as ServerCatalog;
  }
  return cached;
}

/** A `can` holding the server's default capabilities for these role ids. */
export function canForRoles(roleIds: readonly number[]): Can {
  return makeCan(
    loadServerCatalog().defaultKeysForRoles(roleIds) as ReadonlySet<PermissionKey>,
  );
}
