/**
 * The staff portals' interface languages (ADR-0098). `User.uiLocale` holds one
 * of these ids; null means the default. `client/src/i18n/locales.ts` mirrors
 * this list and its test compares the two.
 */
export const UI_LOCALES = ['uz', 'uz-Cyrl', 'ru', 'de', 'en'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = 'uz';
