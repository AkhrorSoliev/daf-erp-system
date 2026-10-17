"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
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
  const { data, isError, isPlaceholderData, refetch } = useBotList(params);
  // An answer kept from another month, page or page size is never drawn as the current one.
  const fresh = settled(data, isPlaceholderData);
  const rows = fresh?.data ?? [];
  const total = fresh?.total ?? 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-medium">Foydalanuvchilar</p>

        {isError ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
            <button type="button" onClick={() => void refetch()} className="mt-2 underline">
              Qayta urinish
            </button>
          </div>
        ) : !fresh ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Bu oyda bot hech kimni to&apos;xtatmagan — boshqa oyni tanlab ko&apos;ring
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Bot to&apos;xtatdi</TableHead>
                  <TableHead>A&apos;zo bo&apos;ldi</TableHead>
                  <TableHead>Chiqib ketdi</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={row.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(params.page - 1) * params.pageSize + i + 1}
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
                      <Badge variant={stateTone(row.state)}>{STATE_LABEL[row.state]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <PaymentsPager
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPage={onPage}
            onPageSize={onPageSize}
            sizes={BOT_PAGE_SIZES}
            sizeLabel="Sahifadagi qatorlar soni"
          />
        )}
      </CardContent>
    </Card>
  );
}
