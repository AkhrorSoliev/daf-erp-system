"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, PhoneCall, UserMinus } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentRemoveFromGroupDialog } from "@/components/students/student-remove-from-group-dialog";
import type { DepartureChoice } from "@/components/students/departure-money";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n/context";
import {
  CALL_OUTCOME_INFO,
  type BlockedFromLessonsItem,
  type BlockedFromLessonsResponse,
} from "./outreach-types";
import type { LogCallPrefill } from "./log-call-dialog";
import { TablePagination } from "./table-pagination";

interface BlockedFromLessonsTabProps {
  isActive: boolean;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}

interface RemoveTarget {
  studentId: number;
  enrollmentId: string;
  studentName: string;
}

// Boshqa tablar bilan bitta URL — o'z prefiksi bilan.
const FILTER_SCHEMA = {
  bl_page: { type: "number", defaultValue: 1 },
  bl_size: { type: "number", defaultValue: 10 },
} as const;

// Shu sondan ko'p dars belgisiz qolgan o'quvchi qizil belgilanadi.
const HOT_MISSED_LESSONS = 8;

export function BlockedFromLessonsTab({
  isActive,
  onLogCall,
}: BlockedFromLessonsTabProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RemoveTarget | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [removing, setRemoving] = useState(false);
  const { filters, setFilter, setFilters } = useUrlFilters(FILTER_SCHEMA);
  const page = filters.bl_page;
  const pageSize = filters.bl_size;

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "blocked-from-lessons"],
    queryFn: () =>
      api
        .get<BlockedFromLessonsResponse>("/outreach/blocked-from-lessons")
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  const { data: reasons } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["student-exit-reasons", "GROUP_REMOVAL"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/student-exit-reasons", {
          params: { appliesTo: "GROUP_REMOVAL" },
        })
        .then((r) => r.data),
    enabled: target !== null,
  });

  const trimmedReason = reasonText.trim();
  const canSubmit =
    (reasons?.length ?? 0) > 0 ? reasonId !== null : trimmedReason.length > 0;

  function resetForm() {
    setTarget(null);
    setReasonId(null);
    setReasonText("");
  }

  async function handleRemove(money: DepartureChoice) {
    if (!target || !canSubmit) return;
    setRemoving(true);
    try {
      const payload: DepartureChoice & {
        departureReasonId?: string;
        reason?: string;
      } = { ...money };
      if (reasonId) payload.departureReasonId = reasonId;
      if (trimmedReason) payload.reason = trimmedReason;
      await api.delete(
        `/students/${target.studentId}/enroll/${target.enrollmentId}`,
        { data: payload },
      );
      toast.success(t("O'quvchi guruhdan chiqarildi"));
      queryClient.invalidateQueries({
        queryKey: ["outreach", "blocked-from-lessons"],
      });
      queryClient.invalidateQueries({ queryKey: ["outreach", "stats"] });
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Chiqarishda xatolik yuz berdi")));
    } finally {
      setRemoving(false);
    }
  }

  const items = data?.items;
  const total = items?.length ?? 0;
  const paged = useMemo(() => {
    if (!items) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  // Ro'yxat qisqarsa (o'quvchi chiqarilgach) sahifa chegaradan chiqib ketmasin.
  useEffect(() => {
    if (!items) return;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) setFilter("bl_page", totalPages);
  }, [items, total, pageSize, page, setFilter]);

  if (isLoading) return <SkeletonRows />;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">
            {t(
              "Qarzi sababli darsga qo'yilmayotgan, lekin hali guruhda turgan o'quvchilar.",
            )}
          </strong>{" "}
          {t(
            "Ustoz ularni davomatda belgilay olmaydi, shuning uchun boshqa ro'yxatlarda ko'rinmaydi. To'lov oling yoki guruhdan chiqaring — chiqarilmasa, keyingi oy ham hisoblanadi.",
          )}
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("Darsga qo'yilmayotgan o'quvchi yo'q.")}
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>{t("O'quvchi")}</TableHead>
                  <TableHead>{t("Telefon")}</TableHead>
                  <TableHead>{t("Guruh / kurs")}</TableHead>
                  <TableHead>{t("Qarz")}</TableHead>
                  <TableHead>{t("Oxirgi marta kelgan")}</TableHead>
                  <TableHead>{t("Qo'yilmagan darslar")}</TableHead>
                  <TableHead>{t("Aloqa")}</TableHead>
                  <TableHead className="w-72">{t("Amal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row, idx) => (
                  <Row
                    key={row.enrollmentId}
                    row={row}
                    index={(page - 1) * pageSize + idx}
                    onCall={() =>
                      onLogCall({
                        studentId: row.student.id,
                        studentLabel: `${row.student.firstName} ${row.student.lastName}`,
                        studentPhone: row.student.phone,
                        reason: "DEBT",
                      })
                    }
                    onRemove={() =>
                      setTarget({
                        studentId: row.student.id,
                        enrollmentId: row.enrollmentId,
                        studentName: `${row.student.firstName} ${row.student.lastName}`,
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={(p) => setFilter("bl_page", p)}
            onPageSizeChange={(s) => setFilters({ bl_size: s, bl_page: 1 })}
          />
        </>
      )}

      <StudentRemoveFromGroupDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) resetForm();
        }}
        reasons={reasons}
        reasonId={reasonId}
        onReasonIdChange={setReasonId}
        reasonText={reasonText}
        onReasonTextChange={setReasonText}
        removing={removing}
        canSubmit={canSubmit}
        onConfirm={handleRemove}
        studentId={target?.studentId ?? null}
        enrollmentId={target?.enrollmentId ?? null}
      />
    </div>
  );
}

function Row({
  row,
  index,
  onCall,
  onRemove,
}: {
  row: BlockedFromLessonsItem;
  index: number;
  onCall: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <TableRow>
      <TableCell className="border-r align-top text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell className="align-top font-medium">
        <Link
          href={`/students/profile/${row.student.id}`}
          className="hover:underline"
        >
          {row.student.firstName} {row.student.lastName}
        </Link>
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell className="align-top">
        <div>{formatPhone(row.student.phone)}</div>
        {row.student.parentPhone && (
          <div className="text-xs text-muted-foreground">
            {t("Ota-ona telefoni")}: {formatPhone(row.student.parentPhone)}
          </div>
        )}
      </TableCell>
      <TableCell className="align-top">
        <Link href={`/groups/${row.group.id}`} className="hover:underline">
          {row.group.name}
        </Link>
        {row.group.course?.name && (
          <div className="text-xs text-muted-foreground">
            {row.group.course.name}
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap align-top font-semibold text-red-600">
        {t("{amount} so'm", { amount: formatPrice(row.debt) })}
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        {row.lastCameDate ? (
          <>
            <div>{formatDay(row.lastCameDate)}</div>
            <div className="text-xs text-muted-foreground">
              {t("{days} kun oldin", { days: daysAgo(row.lastCameDate) })}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">{t("Hech qachon")}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        <Badge
          variant="outline"
          className={
            row.missedLessons >= HOT_MISSED_LESSONS
              ? "bg-red-100 text-red-800"
              : "bg-amber-100 text-amber-800"
          }
        >
          {t("{count} ta dars", { count: row.missedLessons })}
        </Badge>
      </TableCell>
      <TableCell className="align-top">
        <Contact row={row} />
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-wrap items-center gap-1">
          {row.calledToday && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              {t("Bog'lanildi")}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={onCall}>
            <PhoneCall className="mr-1 size-3.5" />
            {t("Qo'ng'iroq qilish")}
          </Button>
          <Button size="sm" variant="destructive" onClick={onRemove}>
            <UserMinus className="mr-1 size-3.5" />
            {t("Guruhdan chiqarish")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Eng muhim aloqa belgisi: to'lov va'dasi, bo'lmasa oxirgi qo'ng'iroq natijasi.
function Contact({ row }: { row: BlockedFromLessonsItem }) {
  const t = useT();
  if (row.promise) {
    const broken = row.promise.status === "BROKEN";
    return (
      <Badge
        variant="outline"
        className={
          broken ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
        }
      >
        {broken ? t("Va'da buzildi") : t("To'lov sanasi")} ·{" "}
        {formatDay(row.promise.date)}
      </Badge>
    );
  }
  if (row.lastCall) {
    const info = CALL_OUTCOME_INFO[row.lastCall.outcome];
    return (
      <Badge variant="outline" className={info.className}>
        {t(info.label)} · {formatDay(row.lastCall.at)}
      </Badge>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">{t("Bog'lanilmagan")}</span>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// 'YYYY-MM-DD' yoki ISO -> 'dd.MM'. Matn bo'yicha kesiladi: sana Toshkent
// kuni, brauzer mintaqasi uni bir kunga surib yubormasin.
function formatDay(value: string) {
  const [, m, d] = value.slice(0, 10).split("-");
  return `${d}.${m}`;
}

function daysAgo(day: string) {
  const ms = Date.now() - new Date(`${day}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
}
