import { Fraunces } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { COMPANY } from "@/lib/company";
import { type PortalType, daftarScope, getPortalConfig } from "@/lib/portal";
import { cn } from "@/lib/utils";
import { LoginFooter } from "./login/login-footer";

// The sheet's handwriting. Declared here rather than in the root layout so
// only the staff sign-in routes download it.
const hand = Fraunces({
  subsets: ["latin"],
  style: "italic",
  variable: "--font-daftar-hand",
});

interface DaftarSheetProps {
  portal: PortalType;
  children: React.ReactNode;
}

/**
 * Shell of the staff sign-in pages — a notebook sheet (`.daftar` in
 * globals.css): squared paper on the admin portal, ruled on the teacher
 * portal. The heading and the children are "written" from the red margin line.
 *
 * Everything on the sheet is laid out in whole 2rem rows counted from its top
 * edge, which is what puts the text on the ruling: keep the top bar at 4rem,
 * give text rows the `daftar-row` class, and size anything else in multiples
 * of a row.
 */
export function DaftarSheet({ portal, children }: DaftarSheetProps) {
  return (
    <div
      className={cn(
        daftarScope(portal),
        hand.variable,
        "daftar-sheet flex min-h-screen flex-col overflow-clip text-foreground",
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-end px-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center pb-8 pl-11 pr-5 sm:px-4">
        <div className="daftar-column relative w-full max-w-sm">
          <p className="daftar-row text-sm text-muted-foreground">
            {COMPANY.tradingName}
          </p>
          <h1 className="daftar-hand mb-8 translate-y-2 text-[2.75rem] leading-[4rem] font-medium text-primary">
            {getPortalConfig(portal).title}
          </h1>
          {children}
        </div>
      </main>
      {/* Opaque, so the margin line ends at the footer instead of striking
          through its text. */}
      <div className="relative bg-background">
        <LoginFooter />
      </div>
    </div>
  );
}
