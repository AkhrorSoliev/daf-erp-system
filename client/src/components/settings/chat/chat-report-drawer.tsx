"use client";

import axios from "axios";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { useChatReport } from "./chat-admin-queries";
import type { ChatReportDetail } from "./chat-admin-types";
import { PersonLine, ReportStatusPill } from "./chat-report-parts";
import { ClosedBlock, ResolveFooter } from "./chat-report-resolve";
import { canResolve, formatReportDate, snapshotLines, type SnapshotLine } from "./chat-report-rules";

/** Controlled by `?shikoyat=` (the tab passes the id and the close handler). */
export function ChatReportDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const query = useChatReport(id);
  const report = query.data;
  // 400: the server rejects a non-UUID id, which is a missing report to the CEO.
  const status = query.isError && axios.isAxiosError(query.error) ? query.error.response?.status : undefined;
  const notFound = status === 404 || status === 400;

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle>{t("Shikoyat")}</SheetTitle>
            {report && <ReportStatusPill status={report.status} />}
          </div>
          <SheetDescription className="sr-only">{t("Shikoyat va yozishmaning nusxasi")}</SheetDescription>
        </SheetHeader>
        {report ? (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <ReportBody report={report} />
            </div>
            {canResolve(report) ? <ResolveFooter key={report.id} report={report} /> : <ClosedBlock report={report} />}
          </>
        ) : notFound ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">{t("Shikoyat topilmadi")}</p>
        ) : query.isError ? (
          <div className="space-y-3 px-6 py-8">
            <p className="text-sm text-muted-foreground">{t("Shikoyatni yuklab bo'lmadi.")}</p>
            <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {t("Qayta urinish")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 px-6 py-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ReportBody({ report }: { report: ChatReportDetail }) {
  const t = useT();
  const lines = snapshotLines(report);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("Shikoyat qilgan")}</p>
          <PersonLine person={{ ...report.reporter, chatBannedAt: null }} />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("Shikoyat qilingan")}</p>
          <PersonLine person={report.reported} />
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">{t("Sana")}</p>
        <p className="text-sm">{formatReportDate(report.createdAt)}</p>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">{t("Sabab")}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{report.reason}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">{t("Yozishmaning nusxasi (oxirgi {n} xabar)", { n: lines.length })}</p>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nusxada xabar yo'q")}</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <Bubble key={l.id} line={l} name={l.side === "reporter" ? report.reporter.name : l.side === "reported" ? report.reported.name : null} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const SIDE_CLASS = {
  reporter: "ml-auto bg-primary/10",
  reported: "mr-auto bg-muted",
  other: "mx-auto border bg-background",
} as const;

function Bubble({ line, name }: { line: SnapshotLine; name: string | null }) {
  const t = useT();
  return (
    <li className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", SIDE_CLASS[line.side])}>
      {name && <p className="mb-0.5 text-xs font-medium text-muted-foreground">{name}</p>}
      {line.deleted && <p className="text-xs italic text-muted-foreground">{t("o'chirilgan xabar")}</p>}
      {line.kind === "TEXT" ? (
        <p className="whitespace-pre-wrap break-words">{line.text}</p>
      ) : (
        <p className="text-muted-foreground">
          {line.kind === "IMAGE" ? t("Rasm") : t("Ovozli xabar")} · {t("fayl ko'rsatilmaydi")}
        </p>
      )}
      {line.originalText !== null && (
        <p className="mt-1 whitespace-pre-wrap break-words border-t border-dashed pt-1 text-xs text-muted-foreground">
          <span className="font-medium">{t("Asl matn")}: </span>
          {line.originalText}
        </p>
      )}
      <p className="mt-0.5 text-right text-[11px] text-muted-foreground">{formatReportDate(line.createdAt)}</p>
    </li>
  );
}
