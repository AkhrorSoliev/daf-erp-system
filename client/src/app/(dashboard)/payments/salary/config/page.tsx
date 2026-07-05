import { redirect } from "next/navigation";

// The dedicated "Oylik belgilash" page was merged into /payments/salary —
// salary rates are now edited inline (per-teacher pencil + bulk select) on the
// live overview. Old bookmarks land on the unified page.
export default function SalaryConfigPage() {
  redirect("/payments/salary");
}
