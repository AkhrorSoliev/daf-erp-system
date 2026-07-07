import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

import { uz, type Dict } from './uz';
import { de } from './de';

export type Lang = 'uz' | 'de';

const STORAGE_KEY = 'app-lang';

/** All languages, in the order shown in the settings picker. */
export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

const DICTS: Record<Lang, Dict> = { uz, de };

type LangState = {
  lang: Lang;
  dict: Dict;
  setLang: (lang: Lang) => void;
  hydrate: () => Promise<void>;
};

/** Language store — persists the user's choice; default is O'zbekcha. */
export const useLanguageStore = create<LangState>((set) => ({
  lang: 'uz',
  dict: uz,
  setLang: (lang) => {
    set({ lang, dict: DICTS[lang] });
    SecureStore.setItemAsync(STORAGE_KEY, lang).catch(() => {});
  },
  hydrate: async () => {
    let lang: Lang = 'uz';
    try {
      const saved = (await SecureStore.getItemAsync(STORAGE_KEY)) as Lang | null;
      if (saved === 'uz' || saved === 'de') lang = saved;
    } catch {
      // fall back to O'zbekcha
    }
    set({ lang, dict: DICTS[lang] });
  },
}));

/** Active dictionary. Re-renders the component when the language changes. */
export const useT = () => useLanguageStore((s) => s.dict);
/** Active language code (for highlighting the current option). */
export const useLang = () => useLanguageStore((s) => s.lang);
/** Setter to switch language. */
export const useSetLang = () => useLanguageStore((s) => s.setLang);

export type { Dict };
