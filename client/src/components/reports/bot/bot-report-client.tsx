"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n/context";
import { BotReportCards, BotReportCardsSkeleton } from "./bot-report-cards";
import { useBotSummary } from "./bot-report-queries";
import { BotLevelTests } from "./bot-level-tests";
import { BotReportTable } from "./bot-report-table";
import { BOT_FIRST_MONTH, BOT_SCHEMA, listParams, pageMonth, type BotFilters } from "./bot-report-url";

/** «Bot hisoboti» (spec B7d §5). Every figure is the server's; the page only formats. */
export function BotReportClient() {
  const t = useT();
  const { filters: raw, setFilters } = useUrlFilters(BOT_SCHEMA);
  const filters = raw as BotFilters;
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const { data, isError, refetch } = useBotSummary(month);
  // An answer kept from another month is never drawn as this month's.
  const fresh = data?.month === month ? data : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper
          value={month}
          min={BOT_FIRST_MONTH}
          max={current}
          onChange={(m) => setFilters({ oy: m === current ? "" : m, page: 1 })}
        />
      </div>

      {fresh && !fresh.gateEnabled && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <Send className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{t("Kanal a'zoligi tekshiruvi hozircha o'chiq")}</p>
              <p className="mt-0.5 text-muted-foreground">
                {t("Bot foydalanuvchilardan kanalga a'zo bo'lishni so'ramayapti, shuning uchun quyidagi raqamlar to'planmaydi.")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <p>{t("Ma'lumotni yuklab bo'lmadi")}</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              {t("Qayta urinish")}
            </Button>
          </CardContent>
        </Card>
      ) : fresh ? (
        <BotReportCards summary={fresh} />
      ) : (
        <BotReportCardsSkeleton />
      )}

      <BotLevelTests month={month} />

      <BotReportTable
        params={listParams(filters, current)}
        onPage={(page) => setFilters({ page })}
        onPageSize={(pageSize) => setFilters({ pageSize, page: 1 })}
      />
    </div>
  );
}
