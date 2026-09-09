import { Suspense } from "react";
import { AssetsClient } from "@/components/media/assets-client";

export default function MediaAssetsPage() {
  return (
    <Suspense>
      <AssetsClient />
    </Suspense>
  );
}
