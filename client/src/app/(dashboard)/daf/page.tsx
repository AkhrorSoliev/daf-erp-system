import { Suspense } from "react";
import { DafUmumiyClient } from "@/components/daf-center/daf-umumiy-client";

export default function DafUmumiyPage() {
  // `useSearchParams` Suspense chegarasisiz build'ni yiqitadi.
  return (
    <Suspense fallback={null}>
      <DafUmumiyClient />
    </Suspense>
  );
}
