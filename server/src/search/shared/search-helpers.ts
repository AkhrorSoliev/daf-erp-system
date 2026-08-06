import { Prisma } from '@prisma/client';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';

export interface SearchItem {
  id: number | string;
  label: string;
  sublabel?: string | null;
  photo?: string | null;
  phone?: string | null;
  groupName?: string | null;
  teacherName?: string | null;
  balance?: number | null;
  status?: string | null;
}

export interface CategoryResult {
  items: SearchItem[];
  total: number;
}

export interface SearchContext {
  companyId: number;
  roles: string[];
  userId: number;
  /**
   * The request's RESOLVED branch scope, straight from `@BranchScope()`.
   *
   * Search used to derive its own from `UserBranch` alone, which differed from
   * the canonical rule twice over: it ignored `mainBranch` (a staff member
   * recorded only there resolved to `[]` and search went silently empty — 25
   * active staff in production all carry `UserBranch` rows, so latent rather
   * than live), and it ignored the branch SWITCHER entirely, so a CEO who
   * picked Namangan still searched everything.
   *
   * Re-deriving a scope inside a service is the documented mistake: two scopes
   * in one request is how a workbook came to print one branch on its cover and
   * another in its totals.
   */
  branchScope: ReportBranchIds;
}

/**
 * Sort results by relevance:
 * 1. Exact full match (label === query)
 * 2. Starts with query
 * 3. Contains query
 */
export function sortByRelevance(
  items: SearchItem[],
  query: string,
): SearchItem[] {
  const q = query.toLowerCase();
  return items.sort((a, b) => {
    const aLabel = a.label.toLowerCase();
    const bLabel = b.label.toLowerCase();

    const aExact = aLabel === q ? 0 : 1;
    const bExact = bLabel === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    const aStarts = aLabel.startsWith(q) ? 0 : 1;
    const bStarts = bLabel.startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    return aLabel.localeCompare(bLabel);
  });
}

/**
 * Build name search conditions supporting multi-word queries.
 * "Ali Valiyev" → firstName contains "Ali" AND lastName contains "Valiyev"
 * "Ali" → firstName contains "Ali" OR lastName contains "Ali"
 */
export function buildNameConditions(
  search: string,
): { firstName: Prisma.StringFilter; lastName: Prisma.StringFilter }[] {
  const words = search.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    // "Ali Valiyev" → try both orders: (first=Ali, last=Valiyev) OR (first=Valiyev, last=Ali)
    return [
      {
        firstName: { contains: words[0], mode: 'insensitive' as const },
        lastName: {
          contains: words.slice(1).join(' '),
          mode: 'insensitive' as const,
        },
      },
      {
        firstName: {
          contains: words.slice(1).join(' '),
          mode: 'insensitive' as const,
        },
        lastName: { contains: words[0], mode: 'insensitive' as const },
      },
    ];
  }

  // Single word → search in both fields
  return [
    {
      firstName: { contains: search, mode: 'insensitive' as const },
      lastName: { startsWith: '', mode: 'insensitive' as const },
    },
    {
      firstName: { startsWith: '', mode: 'insensitive' as const },
      lastName: { contains: search, mode: 'insensitive' as const },
    },
  ];
}

/**
 * Parse search input to determine search type
 */
export function parseSearch(search: string) {
  const isIdSearch = search.startsWith('#');
  const idValue = isIdSearch ? Number(search.slice(1)) : null;
  const isNumeric = /^\d+$/.test(search);
  const numericValue = isNumeric ? Number(search) : null;
  return { isIdSearch, idValue, isNumeric, numericValue };
}
