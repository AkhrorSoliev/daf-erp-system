import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportPageHeader } from "@/components/reports/report-page-header";
import { msg } from "@/i18n/msg";
import { BotReportClient } from "@/components/reports/bot/bot-report-client";

export default function BotReportPage() {
  return (
    <div className="space-y-4">
      <ReportPageHeader
        title={msg("Bot hisoboti")}
        description={msg("Telegram kanaliga bot orqali qo'shilganlar statistikasi")}
      />
      {/* BotReportClient oyni URL'dan o'qiydi (useSearchParams) — Next.js
          statik prerender uchun uni Suspense bilan o'rashni talab qiladi. */}
      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
      >
        <BotReportClient />
      </Suspense>
    </div>
  );
}
