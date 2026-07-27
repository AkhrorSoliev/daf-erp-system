import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BotReportClient } from "@/components/reports/bot/bot-report-client";

export default function BotReportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold tracking-tight">
          Bot hisoboti
        </h2>
        <p className="text-sm text-muted-foreground">
          Telegram kanaliga bot orqali qo&apos;shilganlar statistikasi
        </p>
      </div>
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
