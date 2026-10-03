import { Suspense } from "react";
import { QollanmaBoshSahifa } from "@/components/qollanma/qollanma-bosh-sahifa";

// useSearchParams chegarasiz statik prerender'ni to'xtatadi — Suspense shart.
export default function QollanmaPage() {
  return (
    <Suspense>
      <QollanmaBoshSahifa />
    </Suspense>
  );
}
