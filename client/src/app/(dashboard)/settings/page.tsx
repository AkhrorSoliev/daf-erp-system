import { Suspense } from "react";
import { SettingsIndexHeader, SettingsMenu } from "@/components/settings/settings-menu";

export default function SettingsPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <SettingsIndexHeader />
      {/* Qidiruv URL'dagi ?q= ni o'qiydi: useSearchParams Suspense chegarasini talab qiladi. */}
      <Suspense>
        <SettingsMenu />
      </Suspense>
    </div>
  );
}
