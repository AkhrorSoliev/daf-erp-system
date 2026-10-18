import { redirect } from "next/navigation";

// Eski manzil: sahifa «Telegram» ga qo'shildi (guruhlar — uning birinchi varag'i).
export default function TelegramGroupsRedirect() {
  redirect("/settings/telegram");
}
