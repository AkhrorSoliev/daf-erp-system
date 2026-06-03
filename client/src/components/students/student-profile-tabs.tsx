"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import { SmsTab } from "@/components/students/sms-tab";
import { StudentMockExamsTab } from "@/components/students/student-mock-exams-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Student } from "@/data/student-model";
import { useAuth } from "@/hooks/use-auth";
import { StudentGroupCard } from "./student-group-card";
import { StudentPaymentsTable } from "./student-payments-table";
import { LessonTrailTab } from "./lesson-trail-tab";
import { StudentRemoveFromGroupDialog } from "./student-remove-from-group-dialog";
import { StudentClosedEnrollmentsSection } from "./student-closed-enrollments-section";
import type { StudentTransaction } from "./student-profile-tabs-utils";
import type { BalanceSummary } from "./balance-summary-card";
import type { DebtWriteOffEligibility } from "./debt-write-off-types";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
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

export function StudentProfileTabs({
  student,
  onCommentChange,
  onEnrollmentChange,
  groupsRefreshing = false,
  activeTab,
  onTabChange,
}: StudentProfileTabsProps) {
  const user = useAuth((s) => s.user);
  const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const [localGroups, setLocalGroups] = useState(student.groups);
  const isUngrouped = student.isActive && localGroups.length === 0;
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [smsVisible, setSmsVisible] = useState(false);
  const [paymentsVisible, setPaymentsVisible] = useState(false);
  const paymentsShown = useRef(false);
  const [darslarVisible, setDarslarVisible] = useState(false);
  const darslarShown = useRef(false);
  const [transactions, setTransactions] = useState<StudentTransaction[]>([]);
  const [balanceSummary, setBalanceSummary] =
    useState<BalanceSummary | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>(
    [],
  );
  const [smsCount, setSmsCount] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);
  const smsShown = useRef(false);

  useEffect(() => {
    if (!canManage) return;
    api
      .get(`/students/${student.id}/sms`, { params: { page: 1, pageSize: 1 } })
      .then((res) => setSmsCount(res.data.total))
      .catch(() => {});
    api
      .get(`/entity-history/Student/${student.id}`, {
        params: { page: 1, pageSize: 1 },
      })
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

  const handleConfirmed = useCallback(
    (tempId: string, _real: CommentData) => {
      setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
      onCommentChange?.();
    },
    [onCommentChange],
  );

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) =>
        c.id === tempId ? { ...c, _pending: false, _failed: true } : c,
      ),
    );
  }, []);

  // Money-flow events. LESSON_DEDUCTION is included on purpose: it is a real
  // balance outflow (a prepaid sikl batch), so the feed can explain a drop and
  // show — by DATE — which lessons each sikl covered (coverage.first/lastCoveredDate).
  // It is the one type intentionally shared with the "Darslar" tab.
  // LESSON_CONSUMPTION (amount=0, no balance movement) stays Darslar-only.
  //
  // Parallel call to /balance-summary so the top "Qarz tushuntirishi" card
  // populates at the same time. Failures on either request are tolerated —
  // the card just hides on null summary.
  const loadPayments = useCallback(() => {
    setPaymentsLoading(true);
    const txReq = api
      .get(`/transactions/student/${student.id}`, {
        params: {
          pageSize: 20,
          types:
            "PAYMENT,REFUND,ADJUSTMENT,INITIAL_BALANCE,BALANCE_WITHDRAWAL,LESSON_DEDUCTION",
        },
      })
      .then((res) => setTransactions(res.data.data))
      .catch(() => {});
    const summaryReq = api
      .get(`/students/${student.id}/balance-summary`)
      .then((res) => setBalanceSummary(res.data))
      .catch(() => setBalanceSummary(null));
    Promise.all([txReq, summaryReq]).finally(() => setPaymentsLoading(false));
  }, [student.id]);

  // After a correction the tab shows this fresh balance until the parent
  // student refetch lands (which then clears the override — see effect).
  const [balanceOverride, setBalanceOverride] = useState<number | null>(null);
  useEffect(() => {
    setBalanceOverride(null);
  }, [student.balance]);

  const handlePaymentCorrected = useCallback(
    (newBalance: number | null) => {
      if (newBalance !== null) setBalanceOverride(newBalance);
      loadPayments();
      onEnrollmentChange?.();
    },
    [loadPayments, onEnrollmentChange],
  );

  const handleTabChange = useCallback(
    (value: string) => {
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
        loadPayments();
      }
      if (value === "darslar" && !darslarShown.current) {
        darslarShown.current = true;
        setDarslarVisible(true);
      }
    },
    [loadPayments],
  );

  // Trigger lazy-load on direct URL navigation (e.g. ?tab=tolovlar on first load).
  useEffect(() => {
    if (activeTab) handleTabChange(activeTab);
  }, [activeTab, handleTabChange]);

  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeEnrollmentId, setRemoveEnrollmentId] = useState<string | null>(
    null,
  );
  const [removeReason, setRemoveReason] = useState("");
  const [removeReasonId, setRemoveReasonId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  // "Yo'qolgan o'quvchi" write-off state — only meaningful when the
  // server-side eligibility check for the targeted enrollment passes.
  const [writeOff, setWriteOff] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState("");

  const { data: departureReasons } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["student-exit-reasons", "GROUP_REMOVAL"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/student-exit-reasons", {
          params: { appliesTo: "GROUP_REMOVAL" },
        })
        .then((r) => r.data),
    enabled: removeDialogOpen,
  });

  const { data: eligibility, isFetching: eligibilityLoading } =
    useQuery<DebtWriteOffEligibility>({
      queryKey: ["debt-write-off-eligibility", student.id, removeEnrollmentId],
      queryFn: () =>
        api
          .get<DebtWriteOffEligibility>(
            `/students/${student.id}/enrollments/${removeEnrollmentId}/debt-write-off-eligibility`,
          )
          .then((r) => r.data),
      enabled: removeDialogOpen && !!removeEnrollmentId && canManage,
      staleTime: 0,
    });

  const hasConfiguredReasons = (departureReasons?.length ?? 0) > 0;
  const writeOffReady =
    !writeOff || // unchecked → no extra requirements
    (writeOffReason.trim().length >= 5 && !!eligibility?.eligible);
  const canSubmitRemove =
    (hasConfiguredReasons
      ? removeReasonId !== null
      : removeReason.trim().length > 0) && writeOffReady;

  const openRemoveDialog = (enrollmentId: string) => {
    setRemoveEnrollmentId(enrollmentId);
    setRemoveReason("");
    setRemoveReasonId(null);
    setWriteOff(false);
    setWriteOffReason("");
    setRemoveDialogOpen(true);
  };

  const confirmRemove = async () => {
    if (!removeEnrollmentId || !canSubmitRemove) return;
    setRemoving(true);
    // Instant: remove from UI
    setLocalGroups((prev) =>
      prev.filter((g) => g.enrollmentId !== removeEnrollmentId),
    );
    setRemoveDialogOpen(false);
    try {
      const payload: {
        departureReasonId?: string;
        reason?: string;
        writeOffCycleDebt?: boolean;
        writeOffReason?: string;
        writeOffConfirmAmount?: number;
      } = {};
      if (removeReasonId) payload.departureReasonId = removeReasonId;
      if (removeReason.trim()) payload.reason = removeReason.trim();
      if (writeOff && eligibility?.eligible) {
        payload.writeOffCycleDebt = true;
        payload.writeOffReason = writeOffReason.trim();
        payload.writeOffConfirmAmount = eligibility.details.suggestedWriteOff;
      }
      await api.delete(`/students/${student.id}/enroll/${removeEnrollmentId}`, {
        data: payload,
      });
      toast.success(
        writeOff && eligibility?.eligible
          ? "O'quvchi chiqarildi va joriy sikl qarzi hisobdan chiqarildi"
          : "O'quvchi guruhdan chiqarildi",
      );
      onEnrollmentChange?.();
    } catch (err) {
      setLocalGroups(student.groups);
      toast.error(getErrorMessage(err, "Xatolik yuz berdi"));
    } finally {
      setRemoving(false);
      setRemoveEnrollmentId(null);
      setRemoveReason("");
      setRemoveReasonId(null);
      setWriteOff(false);
      setWriteOffReason("");
    }
  };

  return (
    <>
      <Tabs
        value={activeTab ?? "guruhlar"}
        className="w-full"
        onValueChange={(v) => {
          onTabChange?.(v);
          handleTabChange(v);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
          {canManage && <TabsTrigger value="tolovlar">To&apos;lovlar</TabsTrigger>}
          {canManage && <TabsTrigger value="darslar">Darslar</TabsTrigger>}
          {canManage && <TabsTrigger value="izohlar">Izohlar</TabsTrigger>}
          {canManage && (
            <TabsTrigger value="qongiroq">Qo&apos;ng&apos;iroq tarixi</TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="sms">
              SMS{smsCount ? ` (${smsCount > 99 ? "99+" : smsCount})` : ""}
            </TabsTrigger>
          )}
          {canManage && (
            <TabsTrigger value="tarix">
              Tarix
              {historyCount
                ? ` (${historyCount > 99 ? "99+" : historyCount})`
                : ""}
            </TabsTrigger>
          )}
          {canManage && <TabsTrigger value="lid">Lid tarixi</TabsTrigger>}
          {canManage && (
            <TabsTrigger value="mock-imtihonlar">Mock imtihonlar</TabsTrigger>
          )}
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
                <StudentGroupCard
                  key={g.id}
                  group={g}
                  onRemove={openRemoveDialog}
                />
              ))}
            </div>
          ) : (
            <div className="mb-6">
              <EmptyState message="Guruhlar mavjud emas" />
            </div>
          )}

          {canManage && (
            <StudentClosedEnrollmentsSection
              studentId={student.id}
              visible={student.balance < 0}
              onWroteOff={onEnrollmentChange}
            />
          )}
        </TabsContent>

        {/* To'lovlar */}
        <TabsContent value="tolovlar">
          {paymentsVisible ? (
            <StudentPaymentsTable
              isLoading={paymentsLoading}
              balance={balanceOverride ?? student.balance}
              transactions={transactions}
              summary={balanceSummary}
              onCorrected={handlePaymentCorrected}
            />
          ) : (
            <EmptyState message="To'lov ma'lumotlari mavjud emas" />
          )}
        </TabsContent>

        {/* Darslar — davomat + sikl/to'lov monitoringi */}
        <TabsContent value="darslar">
          {darslarVisible ? (
            <LessonTrailTab studentId={student.id} />
          ) : (
            <EmptyState message="Dars ma'lumotlari mavjud emas" />
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
            <SmsTab
              studentId={student.id}
              telegramChatId={student.telegramChatId}
            />
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

        {/* Mock imtihonlar */}
        <TabsContent value="mock-imtihonlar">
          <StudentMockExamsTab studentId={student.id} />
        </TabsContent>
      </Tabs>

      <StudentRemoveFromGroupDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        reasons={departureReasons}
        reasonId={removeReasonId}
        onReasonIdChange={setRemoveReasonId}
        reasonText={removeReason}
        onReasonTextChange={setRemoveReason}
        removing={removing}
        canSubmit={canSubmitRemove}
        onConfirm={confirmRemove}
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        writeOff={writeOff}
        onWriteOffChange={setWriteOff}
        writeOffReason={writeOffReason}
        onWriteOffReasonChange={setWriteOffReason}
      />
    </>
  );
}
