"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DialogPaginationFooter } from "@/components/reports/departed-students/dialog-pagination-footer";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

interface Debtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  groups: string[];
  monthEndDebt: number;
  recovered: number;
  writtenOff: number;
  remaining: number;
}
interface RecoveredPayment {
  id: string;
  studentId: number | null;
  firstName: string;
  lastName: string;
  amount: number;
  method: string | null;
  createdAt: string;
  performedBy: string | null;
}
interface WriteOff {
  id: string;
  studentId: number | null;
  firstName: string;
  lastName: string;
  amount: number;
  reason: string | null;
  performedBy: string | null;
  createdAt: string;
}
interface DetailResponse {
  monthKey: string;
  label: string;
  totals: {
    closingDebt: number;
    recovered: number;
    writtenOff: number;
    remaining: number;
    debtorCount: number;
  };
  debtors: Debtor[];
  recoveredPayments: RecoveredPayment[];
  writeOffs: WriteOff[];
  truncated: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

type TabKey = "debtors" | "recovered" | "writeoffs" | "remaining";

const TAB_HINT: Record<TabKey, string> = {
  debtors: "Oy oxirida qarzi bo'lgan barcha o'quvchilar.",
  recovered: "Shu qarzdorlar oy tugagach to'lagan to'lovlar.",
  writeoffs: "Qarzi naqdsiz hisobdan chiqarilganlar (kim, nega, qachon).",
  remaining: "Qarzi hali to'liq qoplanmagan o'quvchilar.",
};

function fmtDate(iso: string) {
  return format(new Date(iso), "dd.MM.yyyy");
}

function StudentLink({
  id,
  firstName,
  lastName,
}: {
  id: number | null;
  firstName: string;
  lastName: string;
}) {
  const label = `${firstName} ${lastName}`.trim();
  if (id == null) return <span>{label}</span>;
  return (
    <Link
      href={`/students/profile/${id}`}
      className="font-medium hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground">#{id}</span> {label}
    </Link>
  );
}

interface Props {
  target: { monthKey: string; label: string } | null;
  onClose: () => void;
}

export function MonthDebtDetailDialog({ target, onClose }: Props) {
  const open = target !== null;
  const [tab, setTab] = useState<TabKey>("debtors");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset paging when the month or the active tab changes.
  useEffect(() => {
    setPage(1);
  }, [tab, target?.monthKey]);
  // Reset to the first tab each time a new month opens.
  useEffect(() => {
    if (open) setTab("debtors");
  }, [target?.monthKey, open]);

  const { data, isLoading } = useQuery({
    queryKey: ["month-debt-detail", target?.monthKey],
    queryFn: () =>
      api
        .get<DetailResponse>(
          `/reports/monthly-debt-recovery/${target!.monthKey}/detail`,
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const list = useMemo(() => {
    if (!data) return [] as (Debtor | RecoveredPayment | WriteOff)[];
    if (tab === "debtors") return data.debtors;
    if (tab === "recovered") return data.recoveredPayments;
    if (tab === "writeoffs") return data.writeOffs;
    return data.debtors.filter((d) => d.remaining > 0);
  }, [data, tab]);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = list.slice(
    (clampedPage - 1) * pageSize,
    clampedPage * pageSize,
  );

  // Total columns incl. the leading "#": debtors has 5, the others 6.
  const totalCols = tab === "debtors" ? 5 : 6;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(1000px,95vw)] !max-w-[min(1000px,95vw)] flex-col gap-4 overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle>
            {target?.label ?? ""} — batafsil qarzdorlik
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="debtors">
              Qarzdorlar
              {data ? ` (${data.debtors.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="recovered">
              Undirildi
              {data ? ` (${data.recoveredPayments.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="writeoffs">
              Kechirilgan
              {data ? ` (${data.writeOffs.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="remaining">
              Qolgan
              {data
                ? ` (${data.debtors.filter((d) => d.remaining > 0).length})`
                : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{TAB_HINT[tab]}</span>
        </div>

        {/* The ONLY scroll area */}
        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40">
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                {tab === "debtors" && (
                  <>
                    <TableHead>O&apos;quvchi</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Guruh</TableHead>
                    <TableHead className="text-right">Qarz</TableHead>
                  </>
                )}
                {tab === "recovered" && (
                  <>
                    <TableHead>Sana</TableHead>
                    <TableHead>O&apos;quvchi</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Usul</TableHead>
                    <TableHead>Qabul qildi</TableHead>
                  </>
                )}
                {tab === "writeoffs" && (
                  <>
                    <TableHead>Sana</TableHead>
                    <TableHead>O&apos;quvchi</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Sabab</TableHead>
                    <TableHead>Bajardi</TableHead>
                  </>
                )}
                {tab === "remaining" && (
                  <>
                    <TableHead>O&apos;quvchi</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead className="text-right">
                      Boshlang&apos;ich qarz
                    </TableHead>
                    <TableHead className="text-right">Undirildi</TableHead>
                    <TableHead className="text-right">Qolgan</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={totalCols}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : total === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={totalCols}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Ma&apos;lumot yo&apos;q.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r, idx) => {
                  const n = (clampedPage - 1) * pageSize + idx + 1;
                  if (tab === "debtors" || tab === "remaining") {
                    const d = r as Debtor;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="border-r text-muted-foreground tabular-nums">
                          {n}
                        </TableCell>
                        <TableCell>
                          <StudentLink
                            id={d.id}
                            firstName={d.firstName}
                            lastName={d.lastName}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.phone ?? "—"}
                        </TableCell>
                        {tab === "debtors" ? (
                          <>
                            <TableCell className="text-muted-foreground">
                              {d.groups.length ? d.groups.join(", ") : "—"}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums text-red-600">
                              {formatPrice(d.monthEndDebt)}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right tabular-nums">
                              {formatPrice(d.monthEndDebt)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-green-700 dark:text-green-400">
                              {formatPrice(d.recovered)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums text-red-600">
                              {formatPrice(d.remaining)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  }
                  if (tab === "recovered") {
                    const p = r as RecoveredPayment;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="border-r text-muted-foreground tabular-nums">
                          {n}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {fmtDate(p.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StudentLink
                            id={p.studentId}
                            firstName={p.firstName}
                            lastName={p.lastName}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-green-700 dark:text-green-400">
                          {formatPrice(p.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.method
                            ? (METHOD_LABELS[p.method] ?? p.method)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.performedBy ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const w = r as WriteOff;
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="border-r text-muted-foreground tabular-nums">
                        {n}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtDate(w.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StudentLink
                          id={w.studentId}
                          firstName={w.firstName}
                          lastName={w.lastName}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPrice(w.amount)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "max-w-xs truncate text-muted-foreground",
                        )}
                        title={w.reason ?? undefined}
                      >
                        {w.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {w.performedBy ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DialogPaginationFooter
          isLoading={isLoading}
          total={total}
          page={clampedPage}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
