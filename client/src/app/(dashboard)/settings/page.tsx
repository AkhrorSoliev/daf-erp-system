import { Suspense } from "react";
import { SettingsMenu } from "@/components/settings/settings-menu";

export default function SettingsPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">Sozlamalar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Markaz qanday ishlashini shu yerda sozlaysiz.
        </p>
      </div>
      {/* Qidiruv URL'dagi ?q= ni o'qiydi: useSearchParams Suspense chegarasini talab qiladi. */}
      <Suspense>
        <SettingsMenu />
      </Suspense>
    </div>
  );
}
