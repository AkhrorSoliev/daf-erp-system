import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isCalendarDateStr,
  tashkentRangeFilter,
} from '../../common/date/tashkent';

export interface ArchiveFilterInput {
  search?: string;
  deletedById?: number[];
  startDate?: string;
  endDate?: string;
}

/** At most 5 words, 100 characters in all; every word must match (AND). */
export function searchTokens(search?: string): string[] {
  return (search ?? '')
    .trim()
    .slice(0, 100)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/** Phones are stored as 9 digits, so a typed +998… is cut down to them. */
export function phoneNeedle(token: string): string | null {
  if (!/^\+?\d{3,}$/.test(token)) return null;
  const digits = token.replace('+', '');
  return digits.length > 9 && digits.startsWith('998')
    ? digits.slice(3)
    : digits;
}

export function assertArchiveDays(q: ArchiveFilterInput): void {
  for (const day of [q.startDate, q.endDate]) {
    if (day !== undefined && !isCalendarDateStr(day)) {
      throw new BadRequestException(
        "Sana noto'g'ri — kalendarda bunday kun yo'q",
      );
    }
  }
}

function archivedAt(q: ArchiveFilterInput) {
  return {
    deletedAt: { not: null, ...tashkentRangeFilter(q.startDate, q.endDate) },
  };
}

function archivedBy(q: ArchiveFilterInput) {
  return q.deletedById?.length ? { deletedById: { in: q.deletedById } } : {};
}

function leadWord(token: string): Prisma.LeadWhereInput {
  const text = { contains: token, mode: 'insensitive' as const };
  const phone = phoneNeedle(token);
  return {
    OR: [
      { firstName: text },
      { lastName: text },
      { lostReason: text },
      ...(phone
        ? [{ phone: { contains: phone } }, { extraPhone: { contains: phone } }]
        : []),
    ],
  };
}

/** Archive filters only; the caller adds company and branch scope. */
export function archivedLeadFilter(
  q: ArchiveFilterInput,
): Prisma.LeadWhereInput {
  const words = searchTokens(q.search);
  return {
    ...archivedAt(q),
    ...archivedBy(q),
    ...(words.length ? { AND: words.map(leadWord) } : {}),
  };
}

export function archivedSectionFilter(
  q: ArchiveFilterInput,
): Prisma.LeadSectionWhereInput {
  const words = searchTokens(q.search);
  return {
    ...archivedAt(q),
    ...archivedBy(q),
    ...(words.length
      ? {
          AND: words.map((w) => ({
            name: { contains: w, mode: 'insensitive' as const },
          })),
        }
      : {}),
  };
}
