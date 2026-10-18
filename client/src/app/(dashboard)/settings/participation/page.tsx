import { redirect } from "next/navigation";

// Eski manzil: sahifa «O'quv qoidalari» ga qo'shildi.
export default function ParticipationRedirect() {
  redirect("/settings/rules#hujjat");
}
