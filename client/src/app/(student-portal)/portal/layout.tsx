import type { Viewport } from "next";
import { StudentPortalLayout } from "@/components/student-portal/student-portal-layout";

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
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="lumio min-h-screen bg-background text-foreground antialiased">
      <StudentPortalLayout>{children}</StudentPortalLayout>
    </div>
  );
}
