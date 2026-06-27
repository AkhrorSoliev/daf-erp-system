import type { Metadata } from "next";
import { Geist, Inter, Fraunces } from "next/font/google";
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
