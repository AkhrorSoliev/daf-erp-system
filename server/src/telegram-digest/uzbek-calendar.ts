/**
 * Calendar words for student-facing Telegram text, Latin Uzbek. Uzbek
 * suffixes attach to a month name unchanged («Sentabrdagi», «Sentabrdan»,
 * «oktabrning»), so callers build the forms by concatenation.
 */

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
] as const;

/** 10 → 'oktabr'. Lower case: the sentence decides whether it starts one. */
export function uzMonthName(month: number): string {
  const name = MONTHS[month - 1];
  if (!name) throw new RangeError(`Month out of range: ${month}`);
  return name;
}

/** 'oktabr' → 'Oktabr'. */
export function capitalizeUz(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function previousMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/** '2026-10-05' → '05.10.2026'. */
export function formatDigestDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

const WEEK = [
  ['monday', 'Du'],
  ['tuesday', 'Se'],
  ['wednesday', 'Cho'],
  ['thursday', 'Pa'],
  ['friday', 'Ju'],
  ['saturday', 'Sha'],
  ['sunday', 'Ya'],
] as const;

/**
 * `Group.exactDays` as the short labels the enrollment notice uses
 * («Toq kunlar (Du, Cho, Ju)»), Monday first. Unknown names are skipped.
 */
export function shortWeekdaysLabel(exactDays: readonly string[]): string {
  const wanted = new Set(exactDays.map((d) => d.trim().toLowerCase()));
  return WEEK.filter(([day]) => wanted.has(day))
    .map(([, label]) => label)
    .join(', ');
}

const WEEK_FULL: Record<(typeof WEEK)[number][0], string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

/**
 * `Group.exactDays` as full day names for documents (the contract's
 * «Dars jadvali»): «Dushanba, Chorshanba, Juma», Monday first. Unknown names
 * are skipped.
 */
export function fullWeekdaysLabel(exactDays: readonly string[]): string {
  const wanted = new Set(exactDays.map((d) => d.trim().toLowerCase()));
  return WEEK.filter(([day]) => wanted.has(day))
    .map(([day]) => WEEK_FULL[day])
    .join(', ');
}
