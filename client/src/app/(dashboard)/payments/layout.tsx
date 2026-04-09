import { PaymentsLayoutShell } from "@/components/payments/payments-layout-shell";

export default function PaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PaymentsLayoutShell>{children}</PaymentsLayoutShell>;
}
