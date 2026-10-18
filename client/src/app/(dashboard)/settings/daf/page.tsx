import { redirect } from "next/navigation";

// Eski manzil: sahifa «O'quv qoidalari» ga qo'shildi.
export default function DafNormaRedirect() {
  redirect("/settings/rules#daf");
}
