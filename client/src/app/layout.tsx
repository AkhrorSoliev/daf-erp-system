import type { Metadata } from "next";
import { IBM_Plex_Sans, Baloo_2, Nunito, Rubik, Montserrat, Roboto_Condensed, Ubuntu } from "next/font/google";
import "./globals.css";
import "./skins.css";
import { cn } from "@/lib/utils";
import { SKIN_BOOT_SCRIPT } from "@/lib/skin-boot-script";
import { RouteThemeProvider } from "@/components/providers/route-theme-lock";
import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "react-hot-toast";

// The staff portals' one typeface: text, headings and figures alike
// (`--font-sans`, `--font-heading` and `--font-mono` all point at it in
// globals.css). Three weights are enough for a ledger; latin-ext carries the
// Uzbek apostrophe letters. There is no "cyrillic" here on purpose: next/font
// self-hosts every subset of the Google CSS with its unicode-range, so the
// Russian and Uzbek Cyrillic interface already gets Plex's Cyrillic glyphs on
// demand; `subsets` only picks the files preloaded on every page.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Lumio fonts (student portal + student-scoped login + public form). Defined
// globally so portalled Radix content (dialogs/sheets/alerts) — which renders
// at <body>, outside the scoped `.lumio` wrapper — can still resolve them.
// They are only *used* under `.lumio` / `.form-theme`, so the admin and
// teacher portals are visually unchanged.
const fontDisplay = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const fontBody = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// The staff portals' other design skins (ADR-0097). Each is loaded only when
// its skin is chosen: `preload: false` keeps them out of the page's head, and
// the browser fetches a font file only once the skin applies it (`skins.css`
// re-points `--font-plex` at one of these).
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
// Ubuntu has no 600: `font-semibold` falls to its 700.
const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "DaF Sprachzentrum — ERP",
  description: "ERP system for DaF Sprachzentrum language school",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uz"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        plexSans.variable,
        fontDisplay.variable,
        fontBody.variable,
        rubik.variable,
        montserrat.variable,
        robotoCondensed.variable,
        ubuntu.variable,
      )}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <RouteThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <QueryProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </QueryProvider>
            <Toaster position="top-right" />
          </AuthProvider>
        </RouteThemeProvider>
      </body>
    </html>
  );
}
