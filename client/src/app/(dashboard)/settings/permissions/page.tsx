import { Suspense } from "react";
import { PermissionsClient } from "@/components/settings/permissions/permissions-client";

// The client reads `?rol=` through useSearchParams, which needs a Suspense boundary.
export default function PermissionsSettingsPage() {
  return (
    <Suspense>
      <PermissionsClient />
    </Suspense>
  );
}
