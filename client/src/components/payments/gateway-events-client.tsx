"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface GatewayEvent {
  id: string;
  provider: "PAYME" | "CLICK" | "UZUM" | "CASH" | "TRANSFER";
  externalId: string;
  eventType: string;
  payload: any;
  signatureValid: boolean;
  processed: boolean;
  processedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  student: { id: number; firstName: string; lastName: string } | null;
}

interface EventsResponse {
  data: GatewayEvent[];
  total: number;
  page: number;
  pageSize: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
};

const PROVIDER_COLORS: Record<string, string> = {
  PAYME:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 border-blue-200",
  CLICK:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 border-purple-200",
  UZUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-200",
};

// Bosqich nomi + qisqa tushuntirish
const STEP_INFO: Record<string, { label: string; description: string }> = {
  CheckPerformTransaction: {
    label: "Tekshirish",
    description: "To'lov qilish mumkinligini tekshirish (boshlanmagan)",
  },
  CreateTransaction: {
    label: "Boshlandi",
    description: "Foydalanuvchi karta kiritdi, to'lov yaratildi",
  },
  PerformTransaction: {
    label: "To'landi",
    description: "Kartadan pul yechildi, balans to'ldirildi",
  },
  CancelTransaction: {
    label: "Bekor qilindi",
    description: "To'lov bekor qilindi yoki qaytarildi",
  },
  CheckTransaction: {
    label: "Holat so'ralgan",
    description: "Payme tranzaksiya holatini so'radi",
  },
  GetStatement: {
    label: "Hisobot",
    description: "Payme davr uchun tranzaksiyalar ro'yxatini so'radi",
  },
  Prepare: {
    label: "Tayyorlash",
    description: "Click to'lovni tayyorladi (kartadan pul yechishdan oldin)",
  },
  Complete: {
    label: "Yakunlash",
    description: "Click to'lovni yakunladi, pul yechildi",
  },
};

// Summa va talaba ID'ni har provider payload'idan chiqarish
function extractPaymentInfo(e: GatewayEvent): {
  amount: number | null;
  studentIdFromPayload: number | null;
} {
  const p = e.payload;
  if (!p) return { amount: null, studentIdFromPayload: null };

  if (e.provider === "PAYME") {
    const params = p.params ?? {};
    // Payme amount is in tiyin — convert to so'm
    const amountTiyin = params.amount;
    const amount =
      typeof amountTiyin === "number" ? Math.round(amountTiyin / 100) : null;
    const studentIdFromPayload = params.account?.student_id
      ? Number(params.account.student_id)
      : null;
    return { amount, studentIdFromPayload };
  }

  if (e.provider === "CLICK") {
    // Click amount is already in so'm (Float)
    const amount =
      typeof p.amount === "number" ? Math.floor(p.amount) : null;
    const studentIdFromPayload = p.merchant_trans_id
      ? Number(p.merchant_trans_id)
      : null;
    return { amount, studentIdFromPayload };
  }

  return { amount: null, studentIdFromPayload: null };
}

// Umumiy natija: muvaffaqiyatli/kutilmoqda/xato
type Outcome = "success" | "pending" | "failed" | "rejected";

function computeOutcome(e: GatewayEvent): Outcome {
  if (!e.signatureValid) return "rejected";
  if (e.errorMessage) return "failed";
  if (e.processed) return "success";
  return "pending";
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (outcome === "success") {
    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300"
      >
        <CheckCircle2 className="size-3 mr-1" />
        Muvaffaqiyatli
      </Badge>
    );
  }
  if (outcome === "pending") {
    return (
      <Badge
        variant="outline"
        className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300"
      >
        <Clock className="size-3 mr-1" />
        Kutilmoqda
      </Badge>
    );
  }
  if (outcome === "rejected") {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300"
      >
        <XCircle className="size-3 mr-1" />
        Xavfsizlik xatosi
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300"
    >
      <XCircle className="size-3 mr-1" />
      Xato
    </Badge>
  );
}

function formatAmount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US") + " so'm";
}

export function GatewayEventsClient() {
  const [provider, setProvider] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<GatewayEvent | null>(null);
  const [payloadExpanded, setPayloadExpanded] = useState(false);

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
                <strong>{rejectedOnPage}</strong> ta shubhali so&apos;rov — xavfsizlik
                kaliti to&apos;g&apos;ri kelmagan
              </span>
            </div>
          )}
          {pendingOnPage > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/40 px-3 py-2">
              <Activity className="size-4 text-yellow-600" />
              <span className="text-sm text-yellow-800 dark:text-yellow-300">
                <strong>{pendingOnPage}</strong> ta so&apos;rov hali ishlab chiqilmagan
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filtrlar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="O'quvchi ID, ism yoki familiya bo'yicha..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={provider}
          onValueChange={(v) => {
            setProvider(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha to&apos;lov tizimlari</SelectItem>
            <SelectItem value="PAYME">Payme</SelectItem>
            <SelectItem value="CLICK">Click</SelectItem>
            <SelectItem value="UZUM">Uzum</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={outcomeFilter}
          onValueChange={(v) => {
            setOutcomeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha natijalar</SelectItem>
            <SelectItem value="success">Muvaffaqiyatli</SelectItem>
            <SelectItem value="pending">Kutilmoqda</SelectItem>
            <SelectItem value="rejected">Xavfsizlik xatosi</SelectItem>
          </SelectContent>
        </Select>

        <DatePicker
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            setPage(1);
          }}
          placeholder="Boshidan"
        />
        <DatePicker
          value={endDate}
          onChange={(d) => {
            setEndDate(d);
            setPage(1);
          }}
          placeholder="Gacha"
        />

        <Button variant="outline" size="sm" onClick={resetFilters}>
          Tozalash
        </Button>
      </div>

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
                    onClick={() => {
                      setSelected(e);
                      setPayloadExpanded(false);
                    }}
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

      {/* Batafsil dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            setPayloadExpanded(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected &&
            (() => {
              const outcome = computeOutcome(selected);
              const { amount, studentIdFromPayload } =
                extractPaymentInfo(selected);
              const step = STEP_INFO[selected.eventType];
              const studentId = selected.student?.id ?? studentIdFromPayload;

              return (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={PROVIDER_COLORS[selected.provider] ?? ""}
                      >
                        {PROVIDER_LABELS[selected.provider] ?? selected.provider}
                      </Badge>
                      <DialogTitle className="text-lg">
                        {step?.label ?? selected.eventType}
                      </DialogTitle>
                      <OutcomeBadge outcome={outcome} />
                    </div>
                    <DialogDescription>
                      {step?.description ?? "Webhook so'rovi"}
                    </DialogDescription>
                  </DialogHeader>

                  {/* Asosiy ma'lumotlar */}
                  <div className="grid grid-cols-2 gap-4 py-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Vaqt
                      </div>
                      <div className="text-sm">
                        {format(
                          new Date(selected.createdAt),
                          "dd.MM.yyyy, HH:mm:ss",
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Summa
                      </div>
                      <div className="text-sm font-semibold">
                        {formatAmount(amount)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        O&apos;quvchi
                      </div>
                      <div className="text-sm">
                        {selected.student ? (
                          <Link
                            href={`/students/profile/${selected.student.id}`}
                            className="hover:underline hover:text-primary"
                          >
                            #{selected.student.id} {selected.student.firstName}{" "}
                            {selected.student.lastName}
                          </Link>
                        ) : studentId ? (
                          `#${studentId}`
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Qayta ishlangan vaqt
                      </div>
                      <div className="text-sm">
                        {selected.processedAt
                          ? format(
                              new Date(selected.processedAt),
                              "dd.MM.yyyy, HH:mm:ss",
                            )
                          : "—"}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground mb-1">
                        Tranzaksiya raqami (
                        {selected.provider === "PAYME" ? "Payme" : "Click"}{" "}
                        tizimida)
                      </div>
                      <div className="font-mono text-xs break-all bg-muted/50 px-2 py-1 rounded">
                        {selected.externalId}
                      </div>
                    </div>
                  </div>

                  {/* Xato xabari */}
                  {selected.errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
                      <div className="text-xs text-red-700 dark:text-red-300 font-semibold mb-1">
                        Xato xabari
                      </div>
                      <div className="text-sm text-red-900 dark:text-red-200 break-words">
                        {selected.errorMessage}
                      </div>
                    </div>
                  )}

                  {!selected.signatureValid && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-900 dark:text-red-200">
                      <strong>Diqqat:</strong> Bu so&apos;rovning xavfsizlik kaliti
                      to&apos;g&apos;ri kelmagan. Ehtimol, birovning noto&apos;g&apos;ri so&apos;rovi
                      yoki tizim sozlamalarida muammo bor.
                    </div>
                  )}

                  {/* Xom payload (expandable) */}
                  <div className="border-t pt-3">
                    <button
                      onClick={() => setPayloadExpanded((v) => !v)}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {payloadExpanded ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                      Texnik ma&apos;lumot ({selected.provider} yuborgan xom JSON)
                    </button>
                    {payloadExpanded && (
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-80 mt-2">
                        {JSON.stringify(selected.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
