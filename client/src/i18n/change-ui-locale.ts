import type { UiLocale } from "./locales";
import type { Dictionary } from "./translate";

export interface LocaleState {
  locale: UiLocale;
  dictionary: Dictionary;
}

export interface ChangeUiLocaleDeps {
  /** What the page holds now. */
  current(): LocaleState;
  /** The new language's dictionary. */
  load(locale: UiLocale): Promise<Dictionary>;
  /** Put a language into the page and the device cookie. */
  apply(locale: UiLocale, dictionary: Dictionary): void;
  /** Save it on the account (a no-op when nobody is signed in or the change came from the account). */
  persist(locale: UiLocale): Promise<void>;
  /** Tell the user which step failed. */
  fail(error: unknown, stage: "load" | "save"): void;
}

let latest = 0;

/**
 * Switch the interface language: load the dictionary, apply it at once, then
 * save it. A failed load changes nothing; a failed save puts the previous
 * language back. Only the latest call acts, so two quick choices never leave
 * the page on the older one.
 */
export async function changeUiLocale(next: UiLocale, deps: ChangeUiLocaleDeps): Promise<boolean> {
  const seq = ++latest;
  const previous = deps.current();

  let dictionary: Dictionary;
  try {
    dictionary = await deps.load(next);
  } catch (error) {
    if (seq === latest) deps.fail(error, "load");
    return false;
  }
  if (seq !== latest) return false;

  deps.apply(next, dictionary);
  try {
    await deps.persist(next);
    return true;
  } catch (error) {
    if (seq === latest) deps.apply(previous.locale, previous.dictionary);
    deps.fail(error, "save");
    return false;
  }
}
