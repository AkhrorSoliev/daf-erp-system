import { redirect } from "next/navigation";

// The debtor list moved into /payments/debt as its first tab. Kept as a
// redirect rather than deleted: this path is in browser histories, bookmarks
// and Telegram messages, and a 404 would read as the feature being gone.
export default function DebtorsPage() {
  redirect("/payments/debt");
}
