/**
 * Text handling for values that end up inside a `jsonb` column.
 *
 * PostgreSQL will not store a lone UTF-16 surrogate in `json`/`jsonb` — it
 * rejects the whole statement with "invalid input syntax for type json". A
 * plain `String.prototype.slice` counts UTF-16 code units, so cutting a string
 * at a fixed length lands inside a surrogate pair whenever an emoji straddles
 * the boundary, and produces exactly that.
 *
 * This bit us on 2026-08-18: the payment receipt was truncated with
 * `content.slice(0, 100)` for the audit trail, and the receipt template puts
 * 📄 at offset 99 for a common name/amount length. The Telegram message went
 * out fine, the `SmsMessage` row was written — and then `entityHistory.create`
 * was refused, losing the audit row for 42 of the last 400 automatic messages.
 */

/**
 * Truncate to at most `maxChars` CODE POINTS, never splitting a surrogate
 * pair. An emoji is therefore either kept whole or dropped whole.
 */
export function truncateChars(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  // Array.from iterates code points, so a surrogate pair counts as one entry
  // and can never be halved by the slice.
  const points = Array.from(text);
  if (points.length <= maxChars) return text;
  return points.slice(0, maxChars).join('');
}

/**
 * Drop any unpaired surrogate from a string.
 *
 * Last line of defence for values heading into a `jsonb` column from a source
 * we do not control (a pasted name, an upstream error message, a caller that
 * did its own truncation). Well-formed pairs are left untouched.
 */
export function stripLoneSurrogates(text: string): string {
  // Match a high surrogate NOT followed by a low one, or a low surrogate NOT
  // preceded by a high one.
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  );
}
