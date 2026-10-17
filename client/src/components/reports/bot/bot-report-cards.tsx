import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <p className="font-medium">{cohortTitle(summary.month)}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Figure
              label="Bot to'xtatdi"
              value={formatNumber(summary.blocked)}
              hint="kanalga a'zo bo'lmagani uchun"
            />
            <Figure
              label="Shulardan a'zo bo'ldi"
              value={formatNumber(summary.joined)}
              hint={joinedHint(summary.blocked, summary.conversionRate)}
            />
            <Figure
              label="Keyin chiqib ketdi"
              value={formatNumber(summary.left)}
              hint="a'zo bo'lganlardan"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Hammasi shu oyda to&apos;xtatilganlar bo&apos;yicha. A&apos;zo bo&apos;lgani hozirgacha sanaladi.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <p className="font-medium">Bugungi holat</p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Kanal a&apos;zolari</span>
            <span className="tabular-nums">
              {summary.channelMembers === null ? "—" : formatNumber(summary.channelMembers)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Hali a&apos;zo bo&apos;lmagan (kutilmoqda)</span>
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
