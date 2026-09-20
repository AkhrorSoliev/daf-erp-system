"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatPhone } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DialogPaginationFooter } from "@/components/reports/departed-students/dialog-pagination-footer";
import {
  displayDate,
  FUNNEL_START_DATE,
  peopleQueryParams,
  STAGE_LABELS,
  STUCK_LABELS,
} from "./lead-funnel-math";
import type {
  FunnelPeopleResponse,
  PeopleMode,
  PeopleStage,
} from "./lead-funnel-types";

interface LeadFunnelPeopleDialogProps {
  stage: PeopleStage | null;
  /** Manba id'si yoki `"none"`; bo'sh — filtr yo'q. */
  sourceId: string;
  /** Sarlavha uchun; `sourceId` bo'lsa-yu nom topilmasa "Manba" yoziladi. */
  sourceName: string | null;
  /** `unpaid` uchun holat; bo'sh — hammasi. */
  status: string;
  /** Yo'qotish qatoridan ochilganda `"stuck"` — «o'tmaganlar» rejimi darhol faol. */
  initialMode: PeopleMode;
  range: { startDate: string; endDate: string };
  onOpenChange: (open: boolean) => void;
}

/**
 * Bosqichdagi odamlar. Holat (sahifa, rejim) oyna yopilganda tashlanadi —
 * `key` bilan qayta o'rnatiladi, shuning uchun bosqich, manba, holat yoki
 * boshlang'ich rejim o'zgarganda ro'yxat har doim birinchi sahifadan ochiladi.
 */
export function LeadFunnelPeopleDialog({
  stage,
  sourceId,
  sourceName,
  status,
  initialMode,
  range,
  onOpenChange,
}: LeadFunnelPeopleDialogProps) {
  return (
    <Dialog open={stage !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[min(960px,95vw)] !max-w-[min(960px,95vw)] flex-col gap-0 overflow-hidden p-0">
        {stage && (
          <PeopleBody
            key={`${stage}|${sourceId}|${status}|${initialMode}`}
            stage={stage}
            sourceId={sourceId}
            sourceName={sourceName}
            status={status}
            initialMode={initialMode}
            range={range}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_LABELS: Record<string, string> = {
  active: "faol",
  frozen: "muzlatilgan",
  expelled: "chetlatilgan",
  other: "boshqa holatdagi",
};

function PeopleBody({
  stage,
  sourceId,
  sourceName,
  status,
  initialMode,
  range,
}: {
  stage: PeopleStage;
  sourceId: string;
  sourceName: string | null;
  status: string;
  initialMode: PeopleMode;
  range: { startDate: string; endDate: string };
}) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const hasStuck = stage !== "paid" && stage !== "unpaid";
  // «Hammasi» dan ochiladi: ro'yxat jami bosilgan bosqichdagi son bilan bir xil.
  // Yo'qotish qatoridan ochilganda `initialMode` "stuck" bo'lib keladi.
  const [mode, setMode] = useState<PeopleMode>(hasStuck ? initialMode : "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const params = peopleQueryParams({
    stage,
    mode,
    page,
    pageSize,
    range,
    sourceId: sourceId || undefined,
    status: status || undefined,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "reports",
      "lead-funnel",
      "people",
      selectedBranch?.id ?? "all",
      params,
    ],
    queryFn: () =>
      api
        .get<FunnelPeopleResponse>("/reports/lead-funnel/people", { params })
        .then((r) => r.data),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.data ?? [];

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>{STAGE_LABELS[stage]}</DialogTitle>
        <DialogDescription>
          {stage === "unpaid"
            ? `${displayDate(FUNNEL_START_DATE)} dan beri lid bo'lib kelgan, darsga kelgan, lekin hali to'lov qilmaganlar${status ? ` (${STATUS_LABELS[status] ?? status})` : ""}: bugungi holat.`
            : `${displayDate(range.startDate)} – ${displayDate(range.endDate)} oralig'ida kelgan lidlar${sourceId ? ` · manba: ${sourceId === "none" ? "manbasiz" : (sourceName ?? "Manba")}` : ""}.`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        {hasStuck && (
          <div
            role="group"
            aria-label="Ro'yxat turi"
            className="inline-flex w-fit rounded-lg border bg-muted/40 p-0.5 text-sm"
          >
            {(
              [
                ["all", "Hammasi"],
                ["stuck", STUCK_LABELS[stage as keyof typeof STUCK_LABELS]],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setPage(1);
                }}
                className="rounded-md px-3 py-1 transition-colors aria-pressed:bg-background aria-pressed:font-medium aria-pressed:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border sm:block">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Ism</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Manba</TableHead>
                <TableHead>Holati</TableHead>
                <TableHead>Kelgan sana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j} className={j === 0 ? "border-r" : ""}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-destructive"
                  >
                    Ro&apos;yxatni yuklab bo&apos;lmadi. Oynani yopib qayta oching.
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Bu ro&apos;yxatda hech kim yo&apos;q.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p, i) => (
                  <TableRow key={p.key}>
                    <TableCell className="border-r tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.studentId ? (
                        <Link
                          href={`/students/profile/${p.studentId}`}
                          className="hover:underline"
                        >
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.phone ? formatPhone(p.phone) : "—"}
                    </TableCell>
                    <TableCell>{p.source ?? "—"}</TableCell>
                    <TableCell>
                      {p.studentStatus ? (
                        <StatusBadge
                          entityType="students"
                          status={p.studentStatus}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Lid
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {displayDate(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border sm:hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={`sk-${i}`} className="p-3">
                <Skeleton className="h-10 w-full" />
              </li>
            ))
          ) : isError ? (
            <li className="p-6 text-center text-sm text-destructive">
              Ro&apos;yxatni yuklab bo&apos;lmadi. Oynani yopib qayta oching.
            </li>
          ) : rows.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              Bu ro&apos;yxatda hech kim yo&apos;q.
            </li>
          ) : (
            rows.map((p, i) => (
              <li key={p.key} className="flex items-start gap-3 p-3">
                <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {(page - 1) * pageSize + i + 1}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate font-medium">
                    {p.studentId ? (
                      <Link href={`/students/profile/${p.studentId}`} className="hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {p.phone ? (
                      <a href={`tel:+998${p.phone.replace(/\D/g, "").slice(-9)}`} className="tabular-nums hover:underline">
                        {formatPhone(p.phone)}
                      </a>
                    ) : (
                      <span>—</span>
                    )}
                    <span>{p.source ?? "Manbasiz"}</span>
                    <span className="tabular-nums">{displayDate(p.createdAt)}</span>
                  </span>
                </span>
                <span className="shrink-0">
                  {p.studentStatus ? (
                    <StatusBadge entityType="students" status={p.studentStatus} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Lid</span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-t px-6 py-3">
        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      </div>
    </>
  );
}
