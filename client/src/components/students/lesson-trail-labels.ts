import { MONTH_NAMES } from "@/components/groups/attendance/attendance-cycle-utils";

/**
 * A «Darslar» block's title: a month from the first monthly charge on
 * («Oktabr», another year «Dekabr 2026»), a pack-era cycle before it
 * («3-sikl»). A block without `month` (older server) is a cycle (ADR-0062).
 */
export function blockTitle(
  block: { cycleSequenceNumber: number | null; month?: string | null },
  currentYear: string,
): string {
  if (block.month) {
    const [year, month] = block.month.split("-");
    const name = MONTH_NAMES[Number(month)] ?? block.month;
    return year === currentYear ? name : `${name} ${year}`;
  }
  return `${block.cycleSequenceNumber}-sikl`;
}

/** "1/13 dars" while a block is not full; "13 dars" when full or of unknown size. */
export function blockCount(
  lessonCount: number,
  capacity: number | null,
): string {
  return capacity !== null && lessonCount < capacity
    ? `${lessonCount}/${capacity} dars`
    : `${lessonCount} dars`;
}
