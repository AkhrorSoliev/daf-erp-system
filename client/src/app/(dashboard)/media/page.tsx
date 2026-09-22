import { Suspense } from "react";
import { MediaClient } from "@/components/media/media-client";

export default function MediaPage() {
  return (
    <Suspense>
      <MediaClient />
    </Suspense>
  );
}
