"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { AlertTriangle, CalendarIcon, ClockIcon, UsersIcon, UserMinus } from "lucide-react";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import { SmsTab } from "@/components/students/sms-tab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import toast from "react-hot-toast";
import api from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Student, StudentGroup } from "@/data/student-model";
import { useAuth } from "@/hooks/use-auth";

const STATUS_MAP: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  1: { label: "Faol", variant: "default" },
  2: { label: "Boshlanmagan", variant: "secondary" },
  3: { label: "Pauza", variant: "outline" },
  4: { label: "To'xtatilgan", variant: "destructive" },
};

import { formatWeekdays } from "@/lib/weekdays";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function GroupCard({ group, onRemove }: { group: StudentGroup; onRemove?: (enrollmentId: string) => void }) {
  const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];

  const daysLabel = group.exactDays?.length > 0
    ? formatWeekdays(group.exactDays)
    : null;

  const timeLabel =
    group.lessonStartTime && group.lessonEndTime
      ? `${group.lessonStartTime} – ${group.lessonEndTime}`
      : null;

  return (
    <Link href={`/groups/${group.id}`}>
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
        {/* Row 1: Name + Status */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="font-semibold">{group.name}</h4>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Row 2: Course + Teacher */}
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {group.course_name ?? "—"}
            {group.level && ` • ${group.level}`}
          </span>
          {group.teachers.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UsersIcon className="size-3.5" />
              {group.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")}
            </span>
          )}
        </div>

        {/* Row 3: Schedule + Dates */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {(daysLabel || timeLabel) && (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {[daysLabel, timeLabel].filter(Boolean).join(" • ")}
            </span>
          )}
          {group.startDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              {format(new Date(group.startDate), "dd.MM.yyyy")}
              {group.endDate && ` – ${format(new Date(group.endDate), "dd.MM.yyyy")}`}
            </span>
          )}
        </div>

        {/* Row 4: Enrolled date + remove */}
        <div className="mt-2 border-t pt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Qo&apos;shilgan: {format(new Date(group.enrolledAt), "dd.MM.yyyy")}
          </span>
          {onRemove && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={(e) => { e.preventDefault(); onRemove(group.enrollmentId); }}
                >
                  <UserMinus className="mr-1 size-3" />
                  Chiqarish
                </Button>
              </TooltipTrigger>
              <TooltipContent>Guruhdan chiqarish</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </Link>
  );
}

interface StudentProfileTabsProps {
  student: Student;
  onCommentChange?: () => void;
  onEnrollmentChange?: () => void;
  groupsRefreshing?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function StudentProfileTabs({ student, onCommentChange, onEnrollmentChange, groupsRefreshing = false, activeTab, onTabChange }: StudentProfileTabsProps) {
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const [localGroups, setLocalGroups] = useState(student.groups);
  const isUngrouped = student.isActive && localGroups.length === 0;
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [smsVisible, setSmsVisible] = useState(false);
  const [paymentsVisible, setPaymentsVisible] = useState(false);
  const paymentsShown = useRef(false);
  const [payments, setPayments] = useState<{ id: string; amount: number; method: string; createdAt: string; receivedBy: { firstName: string; lastName: string } | null }[]>([]);
  const [transactions, setTransactions] = useState<{ id: string; type: string; amount: number; balanceBefore: number; balanceAfter: number; description: string | null; createdAt: string }[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const [smsCount, setSmsCount] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);
  const smsShown = useRef(false);

  useEffect(() => {
    if (!canManage) return;
    api.get(`/students/${student.id}/sms`, { params: { page: 1, pageSize: 1 } })
      .then((res) => setSmsCount(res.data.total))
      .catch(() => {});
    api.get(`/entity-history/Student/${student.id}`, { params: { page: 1, pageSize: 1 } })
      .then((res) => setHistoryCount(res.data.total))
      .catch(() => {});
  }, [student.id, canManage]);

  // Sync local groups when student prop changes (after background refresh)
  useEffect(() => {
    setLocalGroups(student.groups);
  }, [student.groups]);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback((tempId: string, _real: CommentData) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
    onCommentChange?.();
  }, [onCommentChange]);

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? { ...c, _pending: false, _failed: true } : c)),
    );
  }, []);

  const handleTabChange = (value: string) => {
    if (value === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    }
    if (value === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
    if (value === "sms" && !smsShown.current) {
      smsShown.current = true;
      setSmsVisible(true);
    }
    if (value === "tolovlar" && !paymentsShown.current) {
      paymentsShown.current = true;
      setPaymentsVisible(true);
      setPaymentsLoading(true);
      Promise.all([
        api.get(`/payments/student/${student.id}`, { params: { pageSize: 20 } }),
        api.get(`/transactions/student/${student.id}`, { params: { pageSize: 20 } }),
      ]).then(([pRes, tRes]) => {
        setPayments(pRes.data.data);
        setTransactions(tRes.data.data);
      }).catch(() => {}).finally(() => setPaymentsLoading(false));
    }
  };

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeEnrollmentId, setRemoveEnrollmentId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  const openRemoveDialog = (enrollmentId: string) => {
    setRemoveEnrollmentId(enrollmentId);
    setRemoveReason("");
    setRemoveDialogOpen(true);
  };

  const confirmRemove = async () => {
    if (!removeEnrollmentId || !removeReason.trim()) return;
    setRemoving(true);
    // Instant: remove from UI
    setLocalGroups((prev) => prev.filter((g) => g.enrollmentId !== removeEnrollmentId));
    setRemoveDialogOpen(false);
    try {
      await api.delete(`/students/${student.id}/enroll/${removeEnrollmentId}`, {
        data: { reason: removeReason.trim() },
      });
      toast.success("O'quvchi guruhdan chiqarildi");
      onEnrollmentChange?.();
    } catch (err: any) {
      setLocalGroups(student.groups);
      toast.error(err?.response?.data?.message || "Xatolik yuz berdi");
    } finally {
      setRemoving(false);
      setRemoveEnrollmentId(null);
      setRemoveReason("");
    }
  };

  // Called from parent when enrollment dialog confirms

  return (
    <>
    <Tabs value={activeTab ?? "guruhlar"} className="w-full" onValueChange={(v) => { onTabChange?.(v); handleTabChange(v); }}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        {canManage && <TabsTrigger value="tolovlar">To&apos;lovlar</TabsTrigger>}
        {canManage && <TabsTrigger value="izohlar">Izohlar</TabsTrigger>}
        {canManage && <TabsTrigger value="qongiroq">Qo&apos;ng&apos;iroq tarixi</TabsTrigger>}
        {canManage && (
          <TabsTrigger value="sms">
            SMS{smsCount ? ` (${smsCount > 99 ? "99+" : smsCount})` : ""}
          </TabsTrigger>
        )}
        {canManage && (
          <TabsTrigger value="tarix">
            Tarix{historyCount ? ` (${historyCount > 99 ? "99+" : historyCount})` : ""}
          </TabsTrigger>
        )}
        {canManage && <TabsTrigger value="lid">Lid tarixi</TabsTrigger>}
      </TabsList>

      {/* Guruhlar */}
      <TabsContent value="guruhlar">
        {isUngrouped && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            Talaba faol guruhga qo&apos;shilmagan!
          </div>
        )}

        {groupsRefreshing ? (
          <div className="mb-6 grid gap-3">
            <div className="rounded-lg border p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        ) : localGroups.length > 0 ? (
          <div className="mb-6 grid gap-3">
            {localGroups.map((g) => (
              <GroupCard key={g.id} group={g} onRemove={openRemoveDialog} />
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <EmptyState message="Guruhlar mavjud emas" />
          </div>
        )}

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold">Oylik balans xolati</h3>
          <EmptyState message="Ko'rsatiladigan ma'lumotlar yo'q" />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">To&apos;lovlar</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Miqdor</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead>Xodim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    Ma&apos;lumotlar yo&apos;q
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </TabsContent>

      {/* To'lovlar */}
      <TabsContent value="tolovlar">
        {paymentsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </div>
        ) : paymentsVisible ? (
          <div className="space-y-6">
            {/* Balans */}
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Joriy balans</p>
              <p className={`text-2xl font-bold ${student.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {student.balance.toLocaleString("en-US")} so&apos;m
              </p>
            </div>

            {/* To'lov tarixi */}
            {payments.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">To&apos;lov tarixi</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead>Summa</TableHead>
                      <TableHead>Usul</TableHead>
                      <TableHead>Qabul qildi</TableHead>
                      <TableHead>Sana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-green-600 font-medium">
                          +{p.amount.toLocaleString("en-US")} so&apos;m
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p.method}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(p.createdAt), "dd.MM.yyyy, HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Balans tarixi */}
            {transactions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Balans tarixi</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead>Turi</TableHead>
                      <TableHead>Summa</TableHead>
                      <TableHead>Balans</TableHead>
                      <TableHead>Sana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t, i) => (
                      <TableRow key={t.id}>
                        <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm">{t.description || t.type}</TableCell>
                        <TableCell className={`font-medium ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {t.amount >= 0 ? "+" : ""}{t.amount.toLocaleString("en-US")} so&apos;m
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.balanceAfter.toLocaleString("en-US")} so&apos;m
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {payments.length === 0 && transactions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Hali to&apos;lov yoki tranzaksiya mavjud emas
              </p>
            )}
          </div>
        ) : (
          <EmptyState message="To'lov ma'lumotlari mavjud emas" />
        )}
      </TabsContent>

      {/* Izohlar */}
      <TabsContent value="izohlar">
        {commentsVisible ? (
          <div className="space-y-4">
            <CommentForm
              entityType="Student"
              entityId={student.id}
              onOptimisticAdd={handleOptimisticAdd}
              onConfirmed={handleConfirmed}
              onFailed={handleFailed}
            />
            <CommentList
              entityType="Student"
              entityId={student.id}
              optimisticComments={optimisticComments}
              onCommentChange={onCommentChange}
            />
          </div>
        ) : (
          <EmptyState message="Izohlar mavjud emas" />
        )}
      </TabsContent>

      {/* Qo'ng'iroq tarixi */}
      <TabsContent value="qongiroq">
        <EmptyState message="Qo'ng'iroq tarixi mavjud emas" />
      </TabsContent>

      {/* SMS */}
      <TabsContent value="sms">
        {smsVisible ? (
          <SmsTab studentId={student.id} telegramChatId={student.telegramChatId} />
        ) : (
          <EmptyState message="SMS tarixi mavjud emas" />
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="Student" entityId={student.id} />
        ) : (
          <EmptyState message="Tarix mavjud emas" />
        )}
      </TabsContent>

      {/* Lid tarixi */}
      <TabsContent value="lid">
        <EmptyState message="Lid tarixi mavjud emas" />
      </TabsContent>
    </Tabs>

      {/* Guruhdan chiqarish dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guruhdan chiqarish</AlertDialogTitle>
            <AlertDialogDescription>
              O&apos;quvchini guruhdan chiqarish sababini kiriting
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Textarea
              placeholder="Sabab yozing..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              disabled={!removeReason.trim() || removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Chiqarilmoqda..." : "Chiqarish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
