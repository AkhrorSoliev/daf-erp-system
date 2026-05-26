"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/lib/format-utils";
import {
  MOCK_EXAM_STATUS_COLORS,
  MOCK_EXAM_STATUS_LABELS,
  useMockExamsBoard,
  type MockExamStatus,
} from "@/hooks/use-mock-exams-board";
import {
  CreateExamDrawer,
  type CreateExamPrefill,
} from "./create-exam-drawer";

const STATUS_FILTERS: Array<{ value: "all" | MockExamStatus; label: string }> =
  [
    { value: "all", label: "Barcha holatlar" },
    {
      value: "REGISTRATION_OPEN",
      label: MOCK_EXAM_STATUS_LABELS.REGISTRATION_OPEN,
    },
    {
      value: "REGISTRATION_CLOSED",
      label: MOCK_EXAM_STATUS_LABELS.REGISTRATION_CLOSED,
    },
    { value: "GRADING", label: MOCK_EXAM_STATUS_LABELS.GRADING },
    { value: "ANNOUNCED", label: MOCK_EXAM_STATUS_LABELS.ANNOUNCED },
    { value: "ARCHIVED", label: MOCK_EXAM_STATUS_LABELS.ARCHIVED },
  ];

export function MockExamsClient() {
  const router = useRouter();
  const exams = useMockExamsBoard((s) => s.exams);
  const loading = useMockExamsBoard((s) => s.loading);
  const loaded = useMockExamsBoard((s) => s.loaded);
  const fetch = useMockExamsBoard((s) => s.fetch);

  const [createExam, setCreateExam] = useState<{
    open: boolean;
    prefill: CreateExamPrefill;
  }>({ open: false, prefill: { sectionId: null } });

  // Filters — section grouping is intentionally not surfaced (backend
  // auto-assigns a default section; UX treats exams as a flat list).
  const [statusFilter, setStatusFilter] = useState<"all" | MockExamStatus>(
    "all",
  );
  const [search, setSearch] = useState("");

  // Revenue summary KPIs
  const [revenue, setRevenue] = useState<{
    totalRevenue: number;
    totalPaid: number;
    totalParticipants: number;
    totalExams: number;
  } | null>(null);

  useEffect(() => {
    if (!loaded) fetch();
  }, [loaded, fetch]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{
        totalRevenue: number;
        totalPaid: number;
        totalParticipants: number;
        totalExams: number;
      }>("/mock-exams/revenue-summary")
      .then(({ data }) => {
        if (!cancelled) setRevenue(data);
      })
      .catch(() => {
        // Silent fail — the page works without the KPI bar.
      });
    return () => {
      cancelled = true;
    };
  }, [exams.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exams, statusFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      {revenue && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={<Wallet className="size-4" />}
            label="Mock daromad"
            value={
              <span>
                {formatPrice(revenue.totalRevenue)}{" "}
                <span className="text-xs text-muted-foreground">so&apos;m</span>
              </span>
            }
          />
          <KpiCard
            icon={<CheckCircle2 className="size-4" />}
            label="To'langan ro'yxatlar"
            value={`${revenue.totalPaid}`}
          />
          <KpiCard
            icon={<Users className="size-4" />}
            label="Jami ishtirokchilar"
            value={`${revenue.totalParticipants}`}
          />
          <KpiCard
            icon={<ClipboardCheck className="size-4" />}
            label="Jami imtihonlar"
            value={`${revenue.totalExams}`}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Mock imtihonlar — sanasi bo&apos;yicha yangidan eskigacha
        </p>
        <Button
          size="sm"
          onClick={() =>
            setCreateExam({ open: true, prefill: { sectionId: null } })
          }
        >
          <Plus className="size-4" />
          Yangi imtihon
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom bo'yicha qidirish..."
          className="w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as "all" | MockExamStatus)
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !loaded ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <ClipboardCheck className="mx-auto size-8 text-muted-foreground opacity-50" />
          <p className="mt-2 text-sm font-medium">
            {exams.length === 0
              ? "Hali imtihon yo'q"
              : "Filtr bo'yicha hech narsa topilmadi"}
          </p>
          {exams.length === 0 && (
            <Button
              className="mt-3"
              onClick={() =>
                setCreateExam({ open: true, prefill: { sectionId: null } })
              }
            >
              <Plus className="size-4" />
              Birinchi imtihonni yaratish
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead className="w-36">Olinish sanasi</TableHead>
                <TableHead>Imtihon nomi</TableHead>
                <TableHead className="w-36">Holat</TableHead>
                <TableHead className="w-36 text-right">Ishtirokchilar</TableHead>
                <TableHead className="w-28 text-right">Narxi</TableHead>
                <TableHead className="w-32">Yaratilgan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e, index) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/mock-exams/${e.id}`)}
                >
                  <TableCell className="border-r text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {e.examDate ? (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        {format(new Date(e.examDate), "dd.MM.yyyy")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{e.title}</div>
                    {e.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {e.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        MOCK_EXAM_STATUS_COLORS[e.status]
                      }`}
                    >
                      {MOCK_EXAM_STATUS_LABELS[e.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.participantCount > 0 ? (
                      <span className="font-medium">{e.participantCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {e.price > 0 ? (
                      <span className="font-medium">
                        {formatPrice(e.price)} so&apos;m
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Bepul</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(e.createdAt), "dd.MM.yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateExamDrawer
        open={createExam.open}
        prefill={createExam.prefill}
        onClose={() =>
          setCreateExam({ open: false, prefill: { sectionId: null } })
        }
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
