import { Suspense } from "react";
import { MonthClosePage } from "@/components/reports/month-close/month-close-page";

// «Oyni yopish»: the month's picture, the bank fee entry and the checklist.
export default function OyniYopishPage() {
  return (
    <Suspense fallback={null}>
      <MonthClosePage />
    </Suspense>
  );
}
