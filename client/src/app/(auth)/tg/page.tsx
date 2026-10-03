import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { MiniAppEntry } from "@/components/telegram-mini-app/mini-app-entry";
import { getPortalType } from "@/lib/portal";
import { miniAppAudienceForHost } from "@/lib/telegram-mini-app";
import { DaftarSheet } from "../daftar-sheet";

export const metadata: Metadata = {
  title: "DaF — kabinet",
};

// Portal bilan bir xil: notch safe-area va Lumio ranglaridagi brauzer paneli.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#08161f" },
  ],
};

/**
 * Telegram Mini App'ning manzili: o'quvchiga `https://student.dafzentrum.uz/tg`
 * (`TELEGRAM_MINI_APP_URL`, ADR-0040), xodimga shu yo'l `lehrer.` yoki `admin.`
 * xostida (ADR-0045) — qaysi kabinet ekanini `MiniAppEntry` xostdan biladi.
 * Middleware'da ochiq: bu yerga sessiyasiz kelinadi, sessiyani shu sahifa
 * yaratadi.
 *
 * The host also picks the look, here on the server, so the first paint is
 * already the right one: the staff cabinet is written on the Daftar sheet of
 * the staff sign-in pages, the student cabinet stays Lumio.
 */
export default async function TelegramMiniAppPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";

  if (miniAppAudienceForHost(host) === "staff") {
    return (
      <DaftarSheet portal={getPortalType(host)}>
        <MiniAppEntry daftar />
      </DaftarSheet>
    );
  }

  return (
    <div className="lumio min-h-screen bg-background text-foreground antialiased">
      <MiniAppEntry />
    </div>
  );
}
