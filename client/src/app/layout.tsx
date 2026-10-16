import type { Metadata } from "next";
import { IBM_Plex_Sans, Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { RouteThemeProvider } from "@/components/providers/route-theme-lock";
import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "react-hot-toast";

// The staff portals' one typeface: text, headings and figures alike
// (`--font-sans`, `--font-heading` and `--font-mono` all point at it in
// globals.css). Three weights are enough for a ledger; latin-ext carries the
// Uzbek apostrophe letters.
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
      )}
    >
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
