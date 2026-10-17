import { DEFAULT_UI_LOCALE, UI_LOCALES } from './ui-locales';

describe('ui locales', () => {
  it('lists the five languages, the default first', () => {
    expect([...UI_LOCALES]).toEqual(['uz', 'uz-Cyrl', 'ru', 'de', 'en']);
    expect(DEFAULT_UI_LOCALE).toBe('uz');
    expect(UI_LOCALES[0]).toBe(DEFAULT_UI_LOCALE);
  });
});
