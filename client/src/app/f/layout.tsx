import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { cn } from "@/lib/utils";

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

export const metadata: Metadata = {
  title: "Forma — DaF Sprachzentrum",
  description: "DaF Sprachzentrum public formasi",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDF1F6" },
    { media: "(prefers-color-scheme: dark)", color: "#08161F" },
  ],
};

// Public form route — no app shell, no auth, no sidebar. The whole tree is
// scoped to the Lumio (`student-app`) design system via `.form-theme`, so the
// page a lead opens on their phone matches the native app's look & feel.
export default function PublicFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        fontDisplay.variable,
        fontBody.variable,
        "form-theme min-h-screen bg-background text-foreground",
        "flex items-center justify-center px-4 py-8 sm:py-12",
      )}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
