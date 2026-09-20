import { Suspense } from "react";
import { DafOquvchilarClient } from "@/components/daf-center/daf-oquvchilar-client";

export default function DafOquvchilarPage() {
  // `useSearchParams` Suspense chegarasisiz build'ni yiqitadi.
  return (
    <Suspense fallback={null}>
      <DafOquvchilarClient />
    </Suspense>
  );
}
