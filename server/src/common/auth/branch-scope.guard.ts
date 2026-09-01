import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCallerBranchScope } from './branch-scope';
import {
  ReportBranchIds,
  resolveReportBranchIds,
} from '../finance/report-branch-scope';

/**
 * ONE branch scope per request, resolved once, at the edge.
 *
 * WHY THIS EXISTS: the branch a user is "in" lived entirely in the browser
 * (`localStorage.branchId` → `?branch_id=`), and the server took it at face
 * value. That made `branch_id` a WIDENING parameter: omit it and you got the
 * whole company; send another branch's id and you got that branch. A Namangan
 * administrator could read Fargona's students — names, phones, parent phones,
 * passport series, balances — by editing one query parameter. Frontend state is
 * not an authorization boundary.
 *
 * The guard computes `request.branchScope` and **blocks nothing**. Refusing a
 * request here would be wrong: plenty of endpoints are legitimately company-wide
 * (company settings, archive, salary period). Each service opts in by reading
 * the scope, so an endpoint that has not been converted keeps behaving exactly
 * as it does today rather than breaking mid-deploy.
 *
 * The requested branch arrives by header (`X-Branch-Id`) OR query
 * (`branch_id` / `branchId`). The header exists because the global
 * `ValidationPipe` runs `forbidNonWhitelisted: true` — injecting a query
 * parameter into every client request would 400 every endpoint whose DTO does
 * not declare it, and could never reach a POST/PATCH body at all. A header is
 * invisible to DTO validation, so the client can send it unconditionally.
 *
 * Resolution is a DB read rather than a JWT claim on purpose. Access tokens live
 * an hour; a claim would keep a WIDER scope alive for up to an hour after an
 * employee's branches were changed. The read is memoised on the request, so
 * report endpoints — which already issue this exact query — end up doing FEWER
 * queries than before, not more.
 */

/** Where the guard parks its answers. */
export const BRANCH_SCOPE_KEY = 'branchScope';
export const BRANCH_CEILING_KEY = 'branchCeiling';

export interface BranchScopedRequest extends Request {
  user?: { id?: number; roles?: string[]; companyId?: number };
  /** Ceiling ∩ requested — what THIS request may see. */
  [BRANCH_SCOPE_KEY]?: ReportBranchIds;
  /** Ceiling alone — every branch the caller may EVER see. */
  [BRANCH_CEILING_KEY]?: ReportBranchIds;
}

/**
 * The branch the caller asked to look at, if any.
 *
 * `'all'` is an explicit request for the unfiltered view (the CEO's "Barcha
 * filiallar"). It is treated as "no pick", NOT as a widening instruction — a
 * scoped caller sending it still gets only their own branches, because the
 * ceiling is applied afterwards regardless.
 */
function readRequestedBranchId(req: BranchScopedRequest): number | null {
  // The QUERY wins over the header, and the order matters.
  //
  // The header is ambient: the client attaches the branch switcher's selection
  // to every request. A query parameter is the opposite — one page naming one
  // branch for one request, which is what the report pages' own "Barcha
  // filiallar" dropdown sends. Reading the header first made that dropdown
  // decorative: with the switcher on Toshkent, picking Namangan on
  // /reports/departed-students still rendered Toshkent's numbers under a
  // control that said Namangan.
  //
  // This cannot widen anything. Whatever is read here is only a REQUEST; the
  // caller's ceiling is intersected with it afterwards, so a parameter naming a
  // branch outside the ceiling resolves to `[]` (nothing) rather than to that
  // branch.
  const raw =
    (req.query as Record<string, unknown> | undefined)?.branch_id ??
    (req.query as Record<string, unknown> | undefined)?.branchId ??
    req.headers?.['x-branch-id'];

  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === '' || value === 'all') return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    // Rejecting beats defaulting. Returning null here would read as "no pick",
    // which resolves to the caller's WHOLE ceiling — so a typo'd or truncated
    // header would silently widen a one-branch view to every branch the caller
    // can see, under a UI still naming the branch they picked.
    throw new BadRequestException(`Filial identifikatori noto'g'ri: ${value}`);
  }
  return parsed;
}

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<BranchScopedRequest>();

    // Unauthenticated (@Public) routes have no caller and therefore no scope.
    // Leaving it undefined — rather than null — keeps "no scope resolved" and
    // "every branch" distinguishable to anything that inspects it.
    const userId = req.user?.id;
    if (userId == null) return true;

    const ceiling = await resolveCallerBranchScope(this.prisma, userId);
    const ceilingIds = ceiling.kind === 'all' ? null : ceiling.branchIds;

    req[BRANCH_CEILING_KEY] = ceilingIds;
    req[BRANCH_SCOPE_KEY] = resolveReportBranchIds(
      ceilingIds,
      readRequestedBranchId(req),
    );

    return true;
  }
}

/**
 * The resolved scope for this request.
 *
 * `null` = every branch (a CEO who picked none). `[]` = NOTHING — a scoped
 * caller who asked for a branch outside their ceiling, or who has no branch
 * attached at all. `[n]` = exactly that branch.
 *
 * Never re-derive this from a raw `branchId` in a service: two scopes in one
 * request is how a workbook came to print one branch on its cover and another
 * in its totals.
 */
export const BranchScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ReportBranchIds => {
    const req = ctx.switchToHttp().getRequest<BranchScopedRequest>();
    // An endpoint reached without the guard (unit tests, @Public) must not read
    // as "every branch" by accident; but a genuinely branch-less CEO legitimately
    // resolves to null, so undefined and null collapse here by design and the
    // guard is registered globally to make the undefined case unreachable.
    return req[BRANCH_SCOPE_KEY] ?? null;
  },
);

/**
 * Every branch the caller may EVER see, ignoring what they currently have
 * selected.
 *
 * Exists for exactly one shape of endpoint: the one that POPULATES the branch
 * picker. `@BranchScope()` is the current selection, so `GET /branches` reading
 * it would return only the already-selected branch and the switcher could never
 * offer the other one — the user would be stuck in whichever branch they last
 * chose. Anything that filters DATA wants `@BranchScope()`, not this.
 */
export const BranchCeiling = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ReportBranchIds => {
    const req = ctx.switchToHttp().getRequest<BranchScopedRequest>();
    return req[BRANCH_CEILING_KEY] ?? null;
  },
);
