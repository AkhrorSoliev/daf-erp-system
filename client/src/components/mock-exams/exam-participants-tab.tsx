"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CircleDollarSign,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type {
  ExamDetail,
  MockExamParticipant,
} from "./exam-detail-types";
import { ManualParticipantDialog } from "./manual-participant-dialog";
import { ConvertParticipantDialog } from "./convert-participant-dialog";
import { MarkPaidDialog } from "./mark-paid-dialog";

interface ExamParticipantsTabProps {
  exam: ExamDetail;
  onParticipantCountChange: (delta: number) => void;
}

interface ParticipantsResponse {
  data: MockExamParticipant[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

function formatPhone(p: string): string {
  // 901234567 → +998 90 123 45 67
  if (p.length !== 9) return p;
  return `+998 ${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5, 7)} ${p.slice(7)}`;
}

export function ExamParticipantsTab({
  exam,
  onParticipantCountChange,
}: ExamParticipantsTabProps) {
  const [data, setData] = useState<MockExamParticipant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<MockExamParticipant | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [convertTarget, setConvertTarget] =
    useState<MockExamParticipant | null>(null);
  const [payTarget, setPayTarget] = useState<MockExamParticipant | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to first page on search change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchRef = useRef(0);
  const fetchData = useCallback(
    async (targetPage: number, q: string) => {
      const requestId = ++fetchRef.current;
      setLoading(true);
      try {
        const { data: resp } = await api.get<ParticipantsResponse>(
          `/mock-exams/${exam.id}/participants`,
          { params: { page: targetPage, pageSize: PAGE_SIZE, search: q || undefined } },
        );
        if (requestId !== fetchRef.current) return;
        setData(resp.data);
        setTotal(resp.total);
        setPage(resp.page);
      } catch (error) {
        if (requestId !== fetchRef.current) return;
        toast.error(
          getErrorMessage(error, "Ishtirokchilarni yuklashda xatolik"),
        );
      } finally {
        if (requestId === fetchRef.current) setLoading(false);
      }
    },
    [exam.id],
  );

  useEffect(() => {
    void fetchData(page, debouncedSearch);
  }, [fetchData, page, debouncedSearch]);

  const handleAdded = (participant: MockExamParticipant) => {
    onParticipantCountChange(1);
    // Refetch to keep ordering / pagination correct
    void fetchData(1, debouncedSearch);
    setPage(1);
  };

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/mock-exam-participants/${deleteTarget.id}`);
      onParticipantCountChange(-1);
      setData((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success("Ishtirokchi o'chirildi");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik"));
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canAddManual =
    exam.status === "REGISTRATION_OPEN" ||
    exam.status === "REGISTRATION_CLOSED";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Ishtirokchilar</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Jami: {total} ta ishtirokchi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism, telefon, username..."
              className="w-64 pl-9"
            />
          </div>
          {canAddManual && (
            <Button size="sm" onClick={() => setManualOpen(true)}>
              <Plus className="size-4" />
              Qo&apos;lda qo&apos;shish
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Ism familya</TableHead>
              <TableHead className="w-16">Daraja</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead className="w-28">To&apos;lov</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Yozildi</TableHead>
              <TableHead className="text-right">Natija</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-32 text-center text-muted-foreground"
                >
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  <Users className="mx-auto mb-2 size-6 opacity-40" />
                  {debouncedSearch
                    ? "Qidiruv bo'yicha hech narsa topilmadi"
                    : "Hali ishtirokchi yo'q"}
                </TableCell>
              </TableRow>
            ) : (
              data.map((p, index) => (
                <TableRow key={p.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + index + 1}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-medium tabular-nums">
                      #{p.publicId}
                    </span>
                    {p.studentId && (
                      <span
                        className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        title="DaF o'quvchisi"
                      >
                        DaF
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.firstName} {p.lastName}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.level ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums">
                        {p.level}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPhone(p.phone)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(() => {
                      const fee = p.feeAmount ?? exam.price;
                      if (p.paid) {
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              ✓ To&apos;langan
                            </span>
                            {fee > 0 && (
                              <span className="tabular-nums text-muted-foreground">
                                {formatPrice(fee)} so&apos;m
                              </span>
                            )}
                          </div>
                        );
                      }
                      if (fee > 0) {
                        const cashChosen = p.formData?.__payIntent === "CASH";
                        return (
                          <div className="flex flex-col gap-0.5">
                            {cashChosen ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                                💵 Naqd kutilmoqda
                              </span>
                            ) : (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                Kutilmoqda
                              </span>
                            )}
                            <span className="tabular-nums text-muted-foreground">
                              {formatPrice(fee)} so&apos;m
                            </span>
                          </div>
                        );
                      }
                      return <span className="text-muted-foreground">Bepul</span>;
                    })()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.telegramUsername ? (
                      `@${p.telegramUsername}`
                    ) : !p.telegramChatId ? (
                      <span className="italic">qo&apos;lda</span>
                    ) : (
                      <span className="font-mono">
                        {p.telegramChatId.slice(0, 8)}…
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(p.registeredAt), "dd.MM.yyyy")}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {p.totalScore !== null ? (
                      <span className="font-medium tabular-nums">
                        {p.totalScore} / {exam.maxScore}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Amallar</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!p.paid && (p.feeAmount ?? exam.price) > 0 && (
                          <DropdownMenuItem onSelect={() => setPayTarget(p)}>
                            <CircleDollarSign className="mr-2 size-4" />
                            To&apos;lov qabul qilish
                          </DropdownMenuItem>
                        )}
                        {p.studentId === null && (
                          <DropdownMenuItem
                            onSelect={() => setConvertTarget(p)}
                          >
                            <UserPlus className="mr-2 size-4" />
                            O&apos;quvchiga aylantirish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => setDeleteTarget(p)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-4" />
                          O&apos;chirish
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Jami: {total} ta ishtirokchi</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Oldingi
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}

      <ManualParticipantDialog
        examId={exam.id}
        offeredLevels={exam.offeredLevels}
        hasStudentDiscount={exam.studentPrice != null}
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onAdded={handleAdded}
      />

      <ConvertParticipantDialog
        participant={convertTarget}
        onClose={() => setConvertTarget(null)}
        onConverted={(participantId, student) => {
          setData((prev) =>
            prev.map((p) =>
              p.id === participantId ? { ...p, studentId: student.id } : p,
            ),
          );
        }}
      />

      <MarkPaidDialog
        participant={payTarget}
        examPrice={exam.price}
        onClose={() => setPayTarget(null)}
        onMarked={(updated) => {
          setData((prev) =>
            prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
          );
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ishtirokchini o&apos;chirish
            </AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.firstName} {deleteTarget?.lastName}&quot;
              imtihondan o&apos;chiriladi. Bu amal arxivlash —
              ma&apos;lumotlar yo&apos;qotilmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
