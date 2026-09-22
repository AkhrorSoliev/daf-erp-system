import { Suspense } from "react";
import { SectionDetailClient } from "@/components/media/section-detail-client";

export default async function MediaSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `SectionDetailClient` reads `useSearchParams()` (`?tab=`, `?format=`) —
  // without `<Suspense>` this bails out of static prerendering and fails
  // `npm run build` (both sibling `/media` pages already wrap for this
  // same reason, and it has broken a build here before).
  return (
    <Suspense>
      <SectionDetailClient sectionId={Number(id)} />
    </Suspense>
  );
}
