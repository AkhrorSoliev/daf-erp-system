"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeacherGroupsTable } from "./teacher-groups-table";
import { TeacherTimelineTab } from "./teacher-timeline-tab";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import type { TeacherData } from "@/hooks/use-edit-teacher";
import type { GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { PossibleDeductionsInfo } from "@/components/payments/possible-deductions-info";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface TeacherProfileTabsProps {
  teacher: TeacherData;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function TeacherProfileTabs({
  teacher,
  activeTab,
  onTabChange,
}: TeacherProfileTabsProps) {
  const user = useAuth((s) => s.user);
  const canSeeSalary =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const canSeeTimeline =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const groupsFetched = useRef(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salarySummary, setSalarySummary] = useState<{
    expectedMonthly: number;
    actualEarned: number;
    accrualCount: number;
    paidTotal: number;
    groups: { groupName: string; activeStudents: number; salaryType: string | null; salaryValue: number; expectedMonthly: number }[];
    hasConfig: boolean;
  } | null>(null);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);
  const salaryShown = useRef(false);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback((tempId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
  }, []);

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? { ...c, _pending: false, _failed: true } : c)),
    );
  }, []);

  const fetchGroups = useCallback(async () => {
    if (groupsFetched.current) return;
    groupsFetched.current = true;
    setGroupsLoading(true);
    try {
      const { data } = await api.get(`/teachers/${teacher.id}/groups`);
      setGroups(data);
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [teacher.id]);

  // Guruhlar default tab — sahifa ochilganda fetch
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Lazy-load tab data — runs both on user click AND on direct URL load
  // (e.g. user reloads the page on ?tab=ish-haqi).
  const activateTab = useCallback(
    (value: string) => {
      if (value === "guruhlar") {
        fetchGroups();
      }
      if (value === "tarix" && !historyShown.current) {
        historyShown.current = true;
        setHistoryVisible(true);
      }
      if (value === "izohlar" && !commentsShown.current) {
        commentsShown.current = true;
        setCommentsVisible(true);
      }
      if (value === "ish-haqi" && !salaryShown.current) {
        salaryShown.current = true;
        setSalaryVisible(true);
        setSalaryLoading(true);
        api
          .get(`/teachers/${teacher.id}/salary-summary`)
          .then((res) => setSalarySummary(res.data))
          .catch(() => {})
          .finally(() => setSalaryLoading(false));
      }
    },
    [fetchGroups, teacher.id],
  );

  useEffect(() => {
    if (activeTab) activateTab(activeTab);
  }, [activeTab, activateTab]);

  const handleTabChange = (value: string) => {
    onTabChange?.(value);
    activateTab(value);
  };

  return (
    <Tabs
      value={activeTab ?? "guruhlar"}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="w-full justify-start overflow-x-auto sticky top-0 z-10 bg-background md:static">
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
        {canSeeTimeline && (
          <TabsTrigger value="taymlayn">Taymlayn</TabsTrigger>
        )}
        {canSeeSalary && (
          <TabsTrigger value="ish-haqi">Ish haqi</TabsTrigger>
        )}
      </TabsList>

      {/* Guruhlar */}
      <TabsContent value="guruhlar">
        {groupsLoading ? (
          <div className="flex h-24 items-center justify-center rounded-md border">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TeacherGroupsTable groups={groups} />
        )}
      </TabsContent>

      {/* Izohlar */}
      <TabsContent value="izohlar">
        {commentsVisible ? (
          <div className="space-y-4">
            <CommentForm
              entityType="User"
              entityId={teacher.id}
              onOptimisticAdd={handleOptimisticAdd}
              onConfirmed={handleConfirmed}
              onFailed={handleFailed}
            />
            <CommentList
              entityType="User"
              entityId={teacher.id}
              optimisticComments={optimisticComments}
            />
          </div>
        ) : (
          <EmptyState message="Izohlar mavjud emas" />
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="User" entityId={teacher.id} />
        ) : (
          <EmptyState message="Tarix ma'lumotlari mavjud emas" />
        )}
      </TabsContent>

      {/* Taymlayn — birlashtirilgan: salary + group + profile (CEO/BD/Admin) */}
      {canSeeTimeline && (
        <TabsContent value="taymlayn">
          <TeacherTimelineTab teacherId={teacher.id} />
        </TabsContent>
      )}

      {/* Ish haqi — faqat CEO va Branch Director */}
      {canSeeSalary && (
        <TabsContent value="ish-haqi">
          {salaryLoading ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : salarySummary && salaryVisible ? (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Kutilayotgan (oylik)</p>
                  <p className="text-lg font-bold text-amber-600">
                    {salarySummary.expectedMonthly.toLocaleString("en-US")} so&apos;m
                  </p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Haqiqiy yig&apos;ilgan</p>
                  <p className="text-lg font-bold text-green-600">
                    {salarySummary.actualEarned.toLocaleString("en-US")} so&apos;m
                  </p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Dars-o&apos;quvchi soni</p>
                  <p className="text-lg font-bold">{salarySummary.accrualCount}</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Jami to&apos;langan</p>
                  <p className="text-lg font-bold">{salarySummary.paidTotal.toLocaleString("en-US")} so&apos;m</p>
                </div>
              </div>

              {/* Per-group breakdown */}
              {salarySummary.groups.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Guruhlar bo&apos;yicha</h4>
                  <div className="space-y-2">
                    {salarySummary.groups.map((g) => (
                      <div key={g.groupName} className="flex items-center justify-between rounded-md border p-3 text-sm">
                        <div>
                          <p className="font-medium">{g.groupName}</p>
                          <p className="text-xs text-muted-foreground">
                            {g.activeStudents} o&apos;quvchi
                            {g.salaryType ? ` · ${g.salaryType === "PERCENTAGE" ? `${g.salaryValue}%` : `${g.salaryValue.toLocaleString("en-US")} so'm`}` : ""}
                          </p>
                        </div>
                        <p className="font-medium text-amber-600">
                          ~{g.expectedMonthly.toLocaleString("en-US")} so&apos;m/oy
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!salarySummary.hasConfig && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  Bu ustoz uchun oylik konfiguratsiyasi belgilanmagan. Moliya bo&apos;limidan sozlang.
                </div>
              )}

              <PossibleDeductionsInfo variant="teacher" />
            </div>
          ) : (
            <EmptyState message="Ish haqi ma'lumotlari mavjud emas" />
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
