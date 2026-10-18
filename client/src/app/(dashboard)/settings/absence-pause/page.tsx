import { redirect } from "next/navigation";

// Eski manzil: sahifa «O'quv qoidalari» ga qo'shildi. Havolalar (bildirishnoma,
// qo'llanma, xabarlar) buzilmasin.
export default function AbsencePauseRedirect() {
  redirect("/settings/rules#pauza");
}
