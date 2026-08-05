/**
 * Every HTTP route this app exposes, discovered from the source itself.
 *
 * WHY IT EXISTS: the type system makes a FORGOTTEN scope a compile error —
 * `ReportBranchIds` is a required parameter, so a service call that omits it
 * does not build. What types cannot see is a route that never calls a scoped
 * service at all: a new controller that queries Prisma directly, or one that
 * calls a company-scoped helper and stops there. Nothing fails, and the endpoint
 * serves every branch.
 *
 * `branch-route-policy.ts` is the answer to that, and this file is what makes it
 * enforceable: the policy manifest is only meaningful if it is checked against
 * reality, and reality is 365 routes across 55 controllers that nobody will
 * re-count by hand.
 *
 * WHY THE TS AST AND NOT A REGEX: a missed route is the one failure this whole
 * mechanism cannot tolerate — it would report full coverage while leaving the
 * new endpoint unclassified, which is worse than having no check. A regex over
 * decorators breaks on a multi-line signature, a decorator inside a comment, a
 * template-literal path. The compiler's own parser does not.
 *
 * WHY STATIC AND NOT `app.getHttpAdapter().getInstance()._router`: booting the
 * real Nest app needs Postgres and Redis. A coverage guard that only runs where
 * infrastructure happens to be up is a guard that stops running.
 *
 * WHY IT LIVES IN `scripts/` AND NOT `src/`: it imports `typescript`, which is a
 * devDependency. `tsconfig.build.json` excludes this directory, so the compiler
 * cannot end up in `dist/` — and no future import from application code can
 * quietly take a production dependency on a package production does not install.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface DiscoveredRoute {
  /** `GET /payments/:id` — the manifest key. */
  key: string;
  method: HttpMethod;
  /** Joined controller prefix + handler path, always leading-slash, no trailing. */
  path: string;
  controller: string;
  handler: string;
  /** Repo-relative source file. */
  file: string;
  /** The handler takes `@BranchScope()` — evidence, not inference. */
  hasBranchScope: boolean;
  /** `@Public()` on the handler or its controller. */
  isPublic: boolean;
  /** Role names from `@Roles(...)` on the handler, else on the controller. */
  roles: string[];
}

const METHOD_DECORATORS: Record<string, HttpMethod> = {
  Get: 'GET',
  Post: 'POST',
  Patch: 'PATCH',
  Put: 'PUT',
  Delete: 'DELETE',
};

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Decorators on a node, tolerating both the legacy and modern AST shapes. */
function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorName(d: ts.Decorator): string | null {
  const expr = ts.isCallExpression(d.expression) ? d.expression.expression : d.expression;
  return ts.isIdentifier(expr) ? expr.text : null;
}

function decoratorArgs(d: ts.Decorator): ts.NodeArray<ts.Expression> | null {
  return ts.isCallExpression(d.expression) ? d.expression.arguments : null;
}

/** First argument as a literal string, or `''` when absent/non-literal. */
function firstStringArg(d: ts.Decorator): string {
  const args = decoratorArgs(d);
  const first = args?.[0];
  return first && ts.isStringLiteral(first) ? first.text : '';
}

function stringArgs(d: ts.Decorator): string[] {
  const args = decoratorArgs(d);
  if (!args) return [];
  const out: string[] = [];
  for (const a of args) {
    if (ts.isStringLiteral(a)) out.push(a.text);
  }
  return out;
}

function joinPath(prefix: string, sub: string): string {
  const parts = [prefix, sub]
    .flatMap((p) => p.split('/'))
    .filter((p) => p.length > 0);
  return '/' + parts.join('/');
}

/**
 * Discover every route under `srcDir`.
 *
 * `@Controller()` with no argument is a real and load-bearing case here — the
 * mock-exam participant routes use it to declare absolute paths like
 * `/students/:studentId/mock-exams`, so treating a missing prefix as an error
 * would drop six endpoints, four of which write money.
 */
export function discoverRoutes(srcDir: string, repoRoot: string): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  for (const file of listFiles(srcDir)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const stmt of source.statements) {
      if (!ts.isClassDeclaration(stmt)) continue;

      const classDecorators = decoratorsOf(stmt);
      const controllerDec = classDecorators.find(
        (d) => decoratorName(d) === 'Controller',
      );
      if (!controllerDec) continue;

      const prefix = firstStringArg(controllerDec);
      const classPublic = classDecorators.some((d) => decoratorName(d) === 'Public');
      const classRolesDec = classDecorators.find((d) => decoratorName(d) === 'Roles');
      const classRoles = classRolesDec ? stringArgs(classRolesDec) : [];
      const controllerName = stmt.name?.text ?? '(anonymous)';

      for (const member of stmt.members) {
        if (!ts.isMethodDeclaration(member)) continue;

        const memberDecorators = decoratorsOf(member);
        const rolesDec = memberDecorators.find((d) => decoratorName(d) === 'Roles');
        const isPublic =
          classPublic || memberDecorators.some((d) => decoratorName(d) === 'Public');

        // A handler's parameters carry `@BranchScope()`.
        const hasBranchScope = member.parameters.some((p) =>
          decoratorsOf(p).some((d) => decoratorName(d) === 'BranchScope'),
        );

        for (const dec of memberDecorators) {
          const name = decoratorName(dec);
          const method = name ? METHOD_DECORATORS[name] : undefined;
          if (!method) continue;

          const path = joinPath(prefix, firstStringArg(dec));
          routes.push({
            key: `${method} ${path}`,
            method,
            path,
            controller: controllerName,
            handler: member.name && ts.isIdentifier(member.name) ? member.name.text : '?',
            file: file.startsWith(repoRoot) ? file.slice(repoRoot.length + 1) : file,
            hasBranchScope,
            isPublic,
            roles: rolesDec ? stringArgs(rolesDec) : classRoles,
          });
        }
      }
    }
  }

  // Deterministic order so a diff of the manifest is readable.
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}
