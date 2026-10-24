import { redirect } from "next/navigation";

// Eski manzil: sahifa «Telegram» ga qo'shildi (hisobot — uning ikkinchi varag'i).
export default function TelegramReportRedirect() {
  redirect("/settings/telegram?tab=hisobot");
}
