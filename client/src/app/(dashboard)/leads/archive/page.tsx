import { Suspense } from "react";
import { LeadsArchive } from "@/components/leads/leads-archive";

export default function LeadsArchivePage() {
  return (
    <Suspense>
      <LeadsArchive />
    </Suspense>
  );
}
