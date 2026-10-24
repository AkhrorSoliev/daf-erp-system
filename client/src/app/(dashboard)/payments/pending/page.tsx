import { redirect } from "next/navigation";

// «Kutilyotgan to'lovlar» was a debtor list: it opens «Qarzdorlik» (CEO, 11.10.2026).
export default function PendingRedirect() {
  redirect("/payments/debt");
}
