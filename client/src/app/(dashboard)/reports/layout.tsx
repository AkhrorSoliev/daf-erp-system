import { ReportsLayoutShell } from "@/components/reports/reports-layout-shell";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReportsLayoutShell>{children}</ReportsLayoutShell>;
}
