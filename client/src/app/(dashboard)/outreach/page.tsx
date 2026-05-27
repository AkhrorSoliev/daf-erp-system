import { Suspense } from "react";
import { OutreachPageClient } from "@/components/outreach/outreach-page-client";

export default function OutreachPage() {
  return (
    <Suspense>
      <OutreachPageClient />
    </Suspense>
  );
}
