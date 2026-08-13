import { redirect } from "next/navigation";

// Moved into /payments/debt as the "Oylik qarzdorlik" tab. A redirect, not a
// deletion: this path is in browser histories, bookmarks and Telegram messages,
// and a 404 would read as the report being gone.
export default function DebtHistoryPage() {
  redirect("/payments/debt?tab=oylik");
}
