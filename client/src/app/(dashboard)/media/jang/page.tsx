import { Suspense } from "react";
import { MediaJangClient } from "@/components/media/media-jang-client";

export default function MediaJangPage() {
  return (
    <Suspense>
      <MediaJangClient />
    </Suspense>
  );
}
