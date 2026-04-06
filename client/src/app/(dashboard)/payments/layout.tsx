import { MoliyaLayoutShell } from "@/components/moliya/moliya-layout-shell";

export default function PaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MoliyaLayoutShell>{children}</MoliyaLayoutShell>;
}
