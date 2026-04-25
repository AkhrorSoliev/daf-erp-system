"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import {
  computeOutcome,
  extractPaymentInfo,
  formatAmount,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  STEP_INFO,
  type EventsResponse,
  type GatewayEvent,
} from "./gateway-events-helpers";
import { OutcomeBadge } from "./gateway-events-outcome-badge";
import { GatewayEventsFilterBar } from "./gateway-events-filter-bar";
import { GatewayEventsDetailDialog } from "./gateway-events-detail-dialog";

export function GatewayEventsClient() {
  const [provider, setProvider] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  // Payme fires CheckPerformTransaction for every user that opens the checkout,
  // even without a real payment intent. It's audit-log noise for CEO monitoring,
  // so we hide it by default and let the user opt in via the toggle.
  const [showChecks, setShowChecks] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<GatewayEvent | null>(null);

  // Map outcome filter to backend params
  const processedParam =
    outcomeFilter === "success"
      ? "true"
      : outcomeFilter === "pending"
        ? "false"
        : undefined;
  const signatureParam = outcomeFilter === "rejected" ? "false" : undefined;

  const { data, isLoading } = useQuery<EventsResponse>({
    queryKey: [
      "gateway-events",
      provider,
      outcomeFilter,
      search,
      startDate,
      endDate,
      showChecks,
      page,
      pageSize,
    ],
    queryFn: () =>
      api
        .get("/gateways/events", {
          params: {
            ...(provider !== "all" && { provider }),
            ...(processedParam !== undefined && { processed: processedParam }),
            ...(signatureParam !== undefined && {
              signatureValid: signatureParam,
            }),
            ...(outcomeFilter === "pending" && { signatureValid: "true" }),
            ...(search && { search }),
            ...(startDate && { startDate: format(startDate, "yyyy-MM-dd") }),
            ...(endDate && { endDate: format(endDate, "yyyy-MM-dd") }),
            ...(!showChecks && { hideChecks: "true" }),
            page,
            pageSize,
          },
        })
        .then((r) => r.data),
  });

  const resetFilters = () => {
    setProvider("all");
    setOutcomeFilter("all");
    setSearch("");
    setStartDate(undefined);
    setEndDate(undefined);
    setShowChecks(false);
    setPage(1);
  };

  const events = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rejectedOnPage = events.filter((e) => !e.signatureValid).length;
  const pendingOnPage = events.filter(
    (e) => !e.processed && e.signatureValid && !e.errorMessage,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          To&apos;lov tizimlari jurnali
        </h2>
        <p className="text-sm text-muted-foreground">
          Payme, Click va Uzum to&apos;lov bosqichlarini kuzatish — qaysi to&apos;lov
          muvaffaqiyatli, qaysi birida muammo borligini bu yerda ko&apos;rasiz
        </p>
      </div>

      {/* Ogohlantirishlar */}
      {(rejectedOnPage > 0 || pendingOnPage > 0) && (
        <div className="flex gap-3 flex-wrap">
          {rejectedOnPage > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-2">
              <AlertTriangle className="size-4 text-red-600" />
              <span className="text-sm text-red-800 dark:text-red-300">
                <strong>{rejectedOnPage}</strong> ta shubhali so&apos;rov —
                xavfsizlik kaliti to&apos;g&apos;ri kelmagan
              </span>
            </div>
          )}
          {pendingOnPage > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/40 px-3 py-2">
              <Activity className="size-4 text-yellow-600" />
              <span className="text-sm text-yellow-800 dark:text-yellow-300">
                <strong>{pendingOnPage}</strong> ta so&apos;rov hali ishlab
                chiqilmagan
              </span>
            </div>
          )}
        </div>
      )}

      <GatewayEventsFilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        provider={provider}
        onProviderChange={(v) => {
          setProvider(v);
          setPage(1);
        }}
        outcomeFilter={outcomeFilter}
        onOutcomeFilterChange={(v) => {
          setOutcomeFilter(v);
          setPage(1);
        }}
        startDate={startDate}
        onStartDateChange={(d) => {
          setStartDate(d);
          setPage(1);
        }}
        endDate={endDate}
        onEndDateChange={(d) => {
          setEndDate(d);
          setPage(1);
        }}
        showChecks={showChecks}
        onShowChecksChange={(v) => {
          setShowChecks(v);
          setPage(1);
        }}
        onReset={resetFilters}
      />

      {/* Jadval */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Vaqt</TableHead>
              <TableHead>To&apos;lov tizimi</TableHead>
              <TableHead>Bosqich</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead className="text-right">Summa</TableHead>
              <TableHead>Natija</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && events.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground"
                >
                  Hech qanday so&apos;rov topilmadi
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              events.map((e, i) => {
                const outcome = computeOutcome(e);
                const { amount, studentIdFromPayload } = extractPaymentInfo(e);
                const step = STEP_INFO[e.eventType];
                const studentId = e.student?.id ?? studentIdFromPayload;

                return (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(e)}
                  >
                    <TableCell className="border-r text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(e.createdAt), "dd.MM.yyyy, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={PROVIDER_COLORS[e.provider] ?? ""}
                      >
                        {PROVIDER_LABELS[e.provider] ?? e.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {step?.label ?? e.eventType}
                      </div>
                    </TableCell>
                    <TableCell>
                      {e.student ? (
                        <Link
                          href={`/students/profile/${e.student.id}`}
                          className="hover:underline hover:text-primary text-sm"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          #{e.student.id} {e.student.firstName}{" "}
                          {e.student.lastName}
                        </Link>
                      ) : studentId ? (
                        <span className="text-sm text-muted-foreground">
                          #{studentId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatAmount(amount)}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={outcome} />
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* Paginatsiya */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          Jami: <strong>{total}</strong> ta yozuv
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 30, 40, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / sahifa
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <GatewayEventsDetailDialog
        event={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
