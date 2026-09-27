import type { Metadata, Viewport } from "next";
import { MiniAppEntry } from "@/components/telegram-mini-app/mini-app-entry";

export const metadata: Metadata = {
  title: "DaF — o'quvchi kabineti",
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
 * Telegram Mini App'ning manzili (`TELEGRAM_MINI_APP_URL` =
 * `https://student.dafzentrum.uz/tg`, ADR-0039). Middleware'da ochiq: bu yerga
 * sessiyasiz kelinadi, sessiyani shu sahifa yaratadi.
 */
export default function TelegramMiniAppPage() {
  return (
    <div className="lumio min-h-screen bg-background text-foreground antialiased">
      <MiniAppEntry />
    </div>
  );
}
