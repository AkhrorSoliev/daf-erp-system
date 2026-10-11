import { redirect } from "next/navigation";
import { legacyStudentPaymentsRedirect } from "@/components/payments/list/payments-url";

// «O'quvchi to'lovi» moved to Moliya → «To'lovlar» (spec B4 §6.2).
export default async function StudentPaymentsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyStudentPaymentsRedirect(await searchParams));
}
