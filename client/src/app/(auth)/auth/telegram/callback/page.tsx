import { Suspense } from "react";
import { headers } from "next/headers";
import { getPortalType } from "@/lib/portal";
import { DaftarSheet } from "../../../daftar-sheet";
import { TelegramCallback } from "./telegram-callback";

// The landing page of Telegram sign-in on every portal. The exchange itself is
// in `TelegramCallback`; this file only picks the shell by host — the student
// portal keeps its plain centred page, the staff portals get their sign-in
// sheet.
export default async function TelegramCallbackPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const portal = getPortalType(host);

  if (portal === "student") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="w-full max-w-sm">
          {/* `useSearchParams` needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <TelegramCallback />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <DaftarSheet portal={portal}>
      <Suspense fallback={null}>
        <TelegramCallback sheet />
      </Suspense>
    </DaftarSheet>
  );
}
