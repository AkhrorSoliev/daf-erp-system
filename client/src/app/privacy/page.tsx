import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPortalType } from "@/lib/portal";
import { COMPANY } from "@/lib/company";
import { PrivacyPolicy } from "@/components/legal/privacy-policy";

export const metadata: Metadata = {
  title: `Maxfiylik siyosati — ${COMPANY.tradingName}`,
  description:
    "DaF Sprachzentrum axborot tizimlarida shaxsiy ma'lumotlar qanday yig'ilishi va qayta ishlanishi.",
};

// Public — no session required. `/privacy` resolves on every host (see
// middleware.ts) so a single URL works from the student, teacher and admin
// logins alike, and so the app stores have a reachable policy link.
export default async function PrivacyPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";

  return <PrivacyPolicy lumio={getPortalType(host) === "student"} />;
}
