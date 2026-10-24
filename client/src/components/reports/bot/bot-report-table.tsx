"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { useT } from "@/i18n/context";
import { dateTime, settled, STATE_LABEL, stateTone } from "./bot-report-format";
import { useBotList } from "./bot-report-queries";
import { BOT_PAGE_SIZES, type listParams } from "./bot-report-url";

/** The month's cohort, one page; the state of each row is the server's. */
export function BotReportTable({
  params,
  onPage,
  onPageSize,
}: {
  params: ReturnType<typeof listParams>;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const t = useT();
  const { data, isError, isPlaceholderData, refetch } = useBotList(params);
  // An answer kept from another month, page or page size is never drawn as the current one.
  const fresh = settled(data, isPlaceholderData);
  const rows = fresh?.data ?? [];
  const total = fresh?.total ?? 0;
  // The client's words for the server's state codes; a local list, because the scanner reads `t(variable)`, not `t(MAP[key])`.
  const shown = rows.map((row) => ({ ...row, stateLabel: STATE_LABEL[row.state] }));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-medium">{t("Foydalanuvchilar")}</p>

        {isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>{t("Ro'yxatni yuklab bo'lmadi")}</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 underline">
              {t("Qayta urinish")}
            </button>
          </div>
        ) : !fresh ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("Bu oyda bot hech kimni to'xtatmagan — boshqa oyni tanlab ko'ring")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>{t("Telegram")}</TableHead>
                  <TableHead>{t("Bot to'xtatdi")}</TableHead>
                  <TableHead>{t("A'zo bo'ldi")}</TableHead>
                  <TableHead>{t("Chiqib ketdi")}</TableHead>
                  <TableHead>{t("Holat")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(fresh.page - 1) * fresh.pageSize + i + 1}
                    </TableCell>
                    <TableCell>
                      {row.username ? (
                        <span className="font-medium">@{row.username}</span>
                      ) : (
                        <span className="text-muted-foreground">{row.firstName ?? `ID ${row.telegramUserId}`}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.blockedAt)}</TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.joinedAt)}</TableCell>
                    <TableCell className="tabular-nums">{dateTime(row.leftAt)}</TableCell>
                    <TableCell>
                      <Badge variant={stateTone(row.state)}>{t(row.stateLabel)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <PaymentsPager
            page={fresh?.page ?? params.page}
            pageSize={fresh?.pageSize ?? params.pageSize}
            total={total}
            onPage={onPage}
            onPageSize={onPageSize}
            sizes={BOT_PAGE_SIZES}
            sizeLabel={t("Sahifadagi qatorlar soni")}
          />
        )}
      </CardContent>
    </Card>
  );
}
