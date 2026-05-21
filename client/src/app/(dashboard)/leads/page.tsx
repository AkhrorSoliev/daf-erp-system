import { Suspense } from "react";
import { LeadsBoardClient } from "@/components/leads/leads-board-client";

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsBoardClient />
    </Suspense>
  );
}
