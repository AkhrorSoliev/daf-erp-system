/**
 * The soft miss (spec §3, ADR-0128): a wrong answer is «almost», painted in
 * the warm amber of duo.html, never the danger red. One place for the tone,
 * so every answer widget says it the same way.
 */

/** A whole answer surface: an option, the typed field, the built sentence. */
export const XATO_SINFI = "border-amber-500 bg-amber-500/10 text-ink-800";
/** A tile inside an answer surface. */
export const XATO_FONI = "bg-amber-500/10 text-ink-800";
/** A picture or clock card: only its frame changes. */
export const XATO_CHEGARASI = "border-amber-500";
/** The mark beside a missed choice (it carries the meaning without colour too). */
export const XATO_BELGISI = "text-amber-700";
/**
 * The «Deyarli!» heading, on the amber-tinted bar. Bright amber is under 3:1
 * there, so it takes `--amber-ink` (dark brown, pale amber at night; globals.css).
 */
export const XATO_SARLAVHASI = "text-[var(--amber-ink)]";
