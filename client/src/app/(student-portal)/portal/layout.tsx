import type { Viewport } from "next";
import { StudentPortalLayout } from "@/components/student-portal/student-portal-layout";
import { I18nProvider } from "@/i18n/context";
import { languageBootScript } from "@/i18n/document-language";
import { currentLocale } from "@/i18n/server";

// Notched-device safe areas + a theme-colored browser chrome that follows the
// Lumio light/dark surfaces. (Next 16: `viewport` is a separate export.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#08161f" },
  ],
};

// The student portal is fully re-skinned to the Lumio design system. This
// layout wraps the whole `/portal/*` subtree in the `.lumio` scope + the Baloo
// 2 / Nunito font variables; the interactive app shell lives in
// StudentPortalLayout (a client component).
//
// The language comes from the device cookie only (no account language for
// students), so no `LocaleSync` here: every pick in the portal is
// `setLocale(next, { save: false })` (see `lumio/language-picker.tsx`).
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  return (
    <I18nProvider initialLocale={locale}>
      {/* Sets <html lang> while the page is parsed (as the dashboard layout
          does); `locale` is whitelisted by `localeOrDefault`. */}
      <script dangerouslySetInnerHTML={{ __html: languageBootScript(locale) }} />
      <div className="lumio min-h-screen bg-background text-foreground antialiased">
        <StudentPortalLayout>{children}</StudentPortalLayout>
      </div>
    </I18nProvider>
  );
}
