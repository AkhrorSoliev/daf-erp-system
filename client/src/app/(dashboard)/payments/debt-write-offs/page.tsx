import { redirect } from "next/navigation";

// Moved into /payments/debt as the "Kechirilganlar" tab. Redirected rather than
// deleted, for the same reason as the debtor list before it.
export default function DebtWriteOffsPage() {
  redirect("/payments/debt?tab=kechirilgan");
}
