import { redirect } from "next/navigation";

// «Muzlatilganlarning puli» became the first tab of «Qaytariladigan pul» (spec
// B2b §3.8). Kept as a redirect rather than deleted: the path is in bookmarks
// and Telegram messages, and a 404 would read as the money being gone.
export default function FrozenBalancesPage() {
  redirect("/payments/refunds?tab=muzlatilgan");
}
