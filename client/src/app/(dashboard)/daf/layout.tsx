import { DafLayoutShell } from "@/components/daf-center/daf-layout-shell";

export default function DafLayout({ children }: { children: React.ReactNode }) {
  return <DafLayoutShell>{children}</DafLayoutShell>;
}
