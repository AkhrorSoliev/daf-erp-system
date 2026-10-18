import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageMenu } from "@/components/auth/language-menu";
import { SignInCover } from "@/components/auth/sign-in-cover";
import { SignInHeading } from "@/components/auth/sign-in-heading";
import { I18nProvider } from "@/i18n/context";
import { languageBootScript } from "@/i18n/document-language";
import { currentLocale } from "@/i18n/server";
import { type PortalType, getPortalConfig } from "@/lib/portal";
import { LoginFooter } from "./login/login-footer";

interface StaffSignInShellProps {
  portal: PortalType;
  /** The language picker next to the theme button; only the sign-in form asks for it. */
  languageMenu?: boolean;
  children: React.ReactNode;
}

/**
 * Shell of the staff sign-in pages (`/login`, the Telegram callback and the
 * staff Mini App entry on `admin.` and `lehrer.`). It draws on the staff
 * portals' own theme — the same tokens, font and logo as the cabinet behind
 * it — so it has no theme of its own; only the cover is special. The two
 * portals differ by the heading alone, as the cabinets do. Like the dashboard
 * layout it reads the device's language cookie here, so the first paint is
 * already in the right language (ADR-0106).
 */
export async function StaffSignInShell({ portal, languageMenu = false, children }: StaffSignInShellProps) {
  const locale = await currentLocale();
  return (
    <I18nProvider initialLocale={locale}>
      {/* Sets <html lang> while the page is parsed (the dashboard layout does
          the same); `locale` is whitelisted by `localeOrDefault`. */}
      <script dangerouslySetInnerHTML={{ __html: languageBootScript(locale) }} />
      <div className="flex min-h-svh flex-col bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SignInCover />
        <div className="flex flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center justify-end gap-2 px-4">
            {languageMenu ? <LanguageMenu /> : null}
            <ThemeToggle />
          </div>
          <main className="flex flex-1 items-center justify-center px-5 pt-2 pb-10 sm:px-8">
            <div className="w-full max-w-sm">
              <SignInHeading title={getPortalConfig(portal).title} />
              {children}
            </div>
          </main>
          <LoginFooter />
        </div>
      </div>
    </I18nProvider>
  );
}
