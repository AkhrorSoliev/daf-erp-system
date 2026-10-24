import type { FulfilledReactPromise, PendingReactPromise, RejectedReactPromise } from "react";
import { loadDictionary } from "./load-dictionary";
import type { UiLocale } from "./locales";
import type { Dictionary } from "./translate";

/**
 * A promise tagged the way React's `use()` reads it: once `status` is
 * "fulfilled", `use()` returns `value` without suspending.
 */
export type DictionaryThenable = Promise<Dictionary> &
  (PendingReactPromise<Dictionary> | FulfilledReactPromise<Dictionary> | RejectedReactPromise<Dictionary>);

// The same promise while this module writes its tags.
type Tagging = Promise<Dictionary> & { status: string; value?: Dictionary; reason?: unknown };

// One entry per language, for the life of the module: in the browser that is
// the page's life, on the server the process's (the dictionaries are static).
const cache = new Map<UiLocale, DictionaryThenable>();

// Uzbek has no dictionary: seed a settled entry, so its pages never suspend.
{
  const uz = Promise.resolve({}) as Tagging;
  uz.status = "fulfilled";
  uz.value = {};
  cache.set("uz", uz as DictionaryThenable);
}

/** How long a failed load stays cached before a read tries again. */
export const RETRY_AFTER_MS = 3000;

/**
 * The dictionary of a language as a cached, tagged promise, so the provider can
 * read it with `use()`: the first read loads the chunk, every later read is
 * synchronous. A failed load is kept for `RETRY_AFTER_MS`, then dropped, so a
 * later read tries again.
 */
export function getDictionary(locale: UiLocale): DictionaryThenable {
  const cached = cache.get(locale);
  if (cached) return cached;
  const tagging = loadDictionary(locale) as Tagging;
  const thenable = tagging as DictionaryThenable;
  tagging.status = "pending";
  tagging.then(
    (value) => {
      tagging.status = "fulfilled";
      tagging.value = value;
    },
    (reason) => {
      tagging.status = "rejected";
      tagging.reason = reason;
      // Kept for a while, so `use()` throws to the error boundary: dropped at
      // once, every retry render would start a new load, suspend again and
      // loop (seen on a production build with the chunk answering 500).
      // ponytail: fixed delay; a retry button pressed sooner meets the same error.
      setTimeout(() => {
        if (cache.get(locale) === thenable) cache.delete(locale);
      }, RETRY_AFTER_MS);
    },
  );
  cache.set(locale, thenable);
  return thenable;
}

/** Keep a dictionary the language switch has just loaded. */
export function rememberDictionary(locale: UiLocale, dictionary: Dictionary): void {
  const tagging = Promise.resolve(dictionary) as Tagging;
  tagging.status = "fulfilled";
  tagging.value = dictionary;
  cache.set(locale, tagging as DictionaryThenable);
}
