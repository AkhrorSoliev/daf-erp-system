import { Suspense } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TeacherChrome } from "@/components/teacher-chrome/teacher-chrome";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { BranchScopedMain } from "@/components/providers/branch-scoped-main";
import { SpotlightHost } from "@/components/spotlight/spotlight-host";
import { I18nProvider } from "@/i18n/context";
import { languageBootScript } from "@/i18n/document-language";
import { LocaleSync } from "@/i18n/locale-sync";
import { loadDictionary } from "@/i18n/load-dictionary";
import { currentLocale } from "@/i18n/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await currentLocale();
  const dictionary = await loadDictionary(locale);
  return (
    <I18nProvider initialLocale={locale} initialDictionary={dictionary}>
      {/* Sets <html lang> while the page is parsed, so the first paint is not
          lang="uz". The locale is whitelisted by `localeOrDefault`, and the root
          <html> has `suppressHydrationWarning`. The provider's effect keeps the
          attribute right after that and resets it when the dashboard is left. */}
      <script dangerouslySetInnerHTML={{ __html: languageBootScript(locale) }} />
      <LocaleSync />
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        {/* `clip`, not `hidden`: a hidden box becomes its own scroll container,
            and `sticky` inside it never sticks (the guide's menu, the form
            builders' side panels, the attendance save bar). */}
        <SidebarInset className="min-w-0 overflow-x-clip">
          <DashboardHeader />
          {/* `<main>` lives in a client component so it can be re-keyed on a
              branch switch — that is what makes the ~47 pages fetching outside
              React Query reload. The header stays outside it, so the switcher is
              not unmounted by its own selection. */}
          <BranchScopedMain>{children}</BranchScopedMain>
          {/* The tour starts only after a page change — so it lives outside
              `<main>`: it does not remount on a branch switch, and its own
              store clears itself via `registerBranchScopedStore`. */}
          <SpotlightHost />
          {/* A teacher's phone chrome: bottom bar, Telegram «←» (see the component). */}
          <Suspense>
            <TeacherChrome />
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
    </I18nProvider>
  );
}
