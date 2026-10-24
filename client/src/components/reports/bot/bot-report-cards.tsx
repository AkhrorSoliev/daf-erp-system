import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { cohortTitle, joinedHint } from "./bot-report-format";
import type { BotSummary } from "./bot-report-types";

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The cohort card (1) and the standing figures (2). Every number is the server's. */
export function BotReportCards({ summary }: { summary: BotSummary }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <p className="font-medium">{cohortTitle(summary.month, t)}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              label={t("Bot to'xtatdi")}
              value={formatNumber(summary.blocked)}
              hint={t("kanalga a'zo bo'lmagani uchun")}
            />
            <Figure
              label={t("Shulardan a'zo bo'ldi")}
              value={formatNumber(summary.joined)}
              hint={joinedHint(summary.blocked, summary.conversionRate, t)}
            />
            <Figure
              label={t("Keyin chiqib ketdi")}
              value={formatNumber(summary.left)}
              hint={t("a'zo bo'lganlardan")}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Hammasi shu oyda to'xtatilganlar bo'yicha. A'zo bo'lgani hozirgacha sanaladi.")}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <p className="font-medium">{t("Bugungi holat")}</p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t("Kanal a'zolari")}</span>
            <span className="tabular-nums">
              {summary.channelMembers === null ? "—" : formatNumber(summary.channelMembers)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t("Hali a'zo bo'lmagan (kutilmoqda)")}</span>
            <span className="tabular-nums">{formatNumber(summary.waiting)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function BotReportCardsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-44" />
      <Skeleton className="h-24" />
    </div>
  );
}
