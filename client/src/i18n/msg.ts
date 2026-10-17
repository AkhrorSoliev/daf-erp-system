/**
 * Marks a text that lives in a list or config (menu titles, breadcrumb names)
 * and is translated later with `t(…)` when it is drawn. It returns the text
 * unchanged; its only job is to let `i18n-coverage.test.ts` find the text.
 * The argument must be a string literal.
 */
export function msg<T extends string>(source: T): T {
  return source;
}
