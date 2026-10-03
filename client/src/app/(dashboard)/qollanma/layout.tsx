import type { ReactNode } from "react";
import { QollanmaLayoutShell } from "@/components/qollanma/qollanma-layout-shell";

export default function QollanmaLayout({ children }: { children: ReactNode }) {
  return <QollanmaLayoutShell>{children}</QollanmaLayoutShell>;
}
