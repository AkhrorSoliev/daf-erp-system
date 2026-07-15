import type { Metadata } from "next";
import { Geist, Inter, Fraunces, Baloo_2, Nunito } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { RouteThemeProvider } from "@/components/providers/route-theme-lock";
import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "react-hot-toast";

const interHeading = Inter({ subsets: ["latin"], variable: "--font-heading" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
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
        geistSans.variable,
        interHeading.variable,
        fraunces.variable,
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
