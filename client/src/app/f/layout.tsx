import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { cn } from "@/lib/utils";
import { PublicPageI18n } from "@/components/public-page-i18n";
import { LanguagePicker } from "@/components/student-portal/lumio/language-picker";
import { serverTranslator } from "@/i18n/server";

// Lumio fonts — same pairing as the student-app (Baloo 2 for display /
// headings, Nunito for body). Exposed as CSS variables consumed by the
// `.form-theme` scope in globals.css.
const fontDisplay = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const fontBody = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverTranslator();
  return {
    title: t("Forma — DaF Sprachzentrum"),
    description: t("DaF Sprachzentrum public formasi"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the sticky button clear the iPhone home bar
  themeColor: "#FFFFFF", // phone: the form is a white page, no card
};

// Public form route — no app shell, no auth, no sidebar. The whole tree is
// scoped to the Lumio (`student-app`) design system via `.form-theme`, so the
// page a lead opens on their phone matches the native app's look & feel.
export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The language picker sits in the top-right corner of every /f page (the
  // form, the thanks, the landing and not-found screens); the form's logo is
  // on the left, so the two never meet.
  return (
    <PublicPageI18n>
      <div
        className={cn(
          fontDisplay.variable,
          fontBody.variable,
          "form-theme relative min-h-dvh bg-background text-foreground",
        )}
      >
        <LanguagePicker variant="plain" className="absolute top-3 right-3 z-20 sm:top-4 sm:right-4" />
        {children}
      </div>
    </PublicPageI18n>
  );
}
