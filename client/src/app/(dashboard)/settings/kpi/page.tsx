import { redirect } from "next/navigation";

// Eski manzil: sahifa «Lidlar va KPI» ga qo'shildi.
export default function KpiRedirect() {
  redirect("/settings/leads-kpi#kpi");
}
