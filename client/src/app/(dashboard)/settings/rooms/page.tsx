import { Suspense } from "react";
import { RoomsSettingsClient } from "@/components/settings/rooms-settings-client";

export default function RoomsSettingsPage() {
  return (
    <Suspense>
      <RoomsSettingsClient />
    </Suspense>
  );
}
