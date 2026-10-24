import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/context";
import { languageBootScript } from "@/i18n/document-language";
import { currentLocale } from "@/i18n/server";

/**
 * The language of a public page (receipt `/r`, certificate `/t`, form `/f`):
 * the device cookie only, as in the student portal (ADR-0120). Uzbek until the
 * visitor picks one; no account, so nothing syncs it to one, and the picker
 * (`LanguagePicker variant="plain"`) never saves (`{ save: false }`).
 */
export async function PublicPageI18n({ children }: { children: ReactNode }) {
  const locale = await currentLocale();
  return (
    <I18nProvider initialLocale={locale}>
      {/* Sets <html lang> while the page is parsed; `locale` is whitelisted by `localeOrDefault`. */}
      <script dangerouslySetInnerHTML={{ __html: languageBootScript(locale) }} />
      {children}
    </I18nProvider>
  );
}
