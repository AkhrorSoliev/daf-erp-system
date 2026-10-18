import { monthShort } from "@/components/payments/salary-utils";
import { interpolate, type Params } from "@/i18n/translate";

/** `t` of a page with a language; the default says the Uzbek text. */
type Translate = (source: string, params?: Params) => string;

const SAY_UZBEK: Translate = interpolate;

/**
 * A «Darslar» block's title: a month from the first monthly charge on
 * («Oktabr», another year «Dekabr 2026»), a pack-era cycle before it
 * («3-sikl»). A block without `month` (older server) is a cycle (ADR-0062).
 */
export function blockTitle(
  block: { cycleSequenceNumber: number | null; month?: string | null },
  currentYear: string,
  t: Translate = SAY_UZBEK,
): string {
  if (block.month) {
    const [year, month] = block.month.split("-");
    const name = monthShort(`${year}-${month}`, t);
    return year === currentYear ? name : `${name} ${year}`;
  }
  return t("{n}-sikl", { n: block.cycleSequenceNumber ?? "" });
}

/** "1/13 dars" while a block is not full; "13 dars" when full or of unknown size. */
export function blockCount(
  lessonCount: number,
  capacity: number | null,
  t: Translate = SAY_UZBEK,
): string {
  return capacity !== null && lessonCount < capacity
    ? t("{n}/{capacity} dars", { n: lessonCount, capacity })
    : t("{n} dars", { n: lessonCount });
}
