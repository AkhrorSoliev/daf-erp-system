"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import { TeacherGroupsTable } from "@/components/teachers/teacher-groups-table";
import { TeacherTimelineTab } from "@/components/teachers/teacher-timeline-tab";
import {
  TeacherGroupsRateList,
  type SalaryGroupsSummary,
} from "@/components/shared/teacher-groups-rate-list";
import { SalaryMonthlyPanel } from "@/components/shared/salary-monthly-panel";
import { PossibleDeductionsInfo } from "@/components/payments/possible-deductions-info";
import type { EmployeeUser } from "@/hooks/use-edit-employee";
import type { GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";

const TEACHER_ROLE_ID = 4;

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface EmployeeProfileTabsProps {
  employee: EmployeeUser;
  onCommentChange?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function EmployeeProfileTabs({
  employee,
  onCommentChange,
  activeTab,
  onTabChange,
}: EmployeeProfileTabsProps) {
  const user = useAuth((s) => s.user);
  const canSeeSalary = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const canSeeTimeline =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
  const isTeacher = employee.roles.some((r) => r.id === TEACHER_ROLE_ID);

  const defaultTab = isTeacher ? "guruhlar" : "izohlar";

  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const groupsFetched = useRef(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salarySummary, setSalarySummary] =
    useState<SalaryGroupsSummary | null>(null);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);
  const salaryShown = useRef(false);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback(
    (tempId: string) => {
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

  const fetchGroups = useCallback(async () => {
    if (groupsFetched.current) return;
    groupsFetched.current = true;
    setGroupsLoading(true);
    try {
      const { data } = await api.get(`/teachers/${employee.id}/groups`);
      setGroups(data);
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [employee.id]);

  // Lazy-load tab data — runs both on user click AND on direct URL load
  // (e.g. user reloads the page on ?tab=ish-haqi).
  const activateTab = useCallback(
    (value: string) => {
      if (value === "guruhlar" && isTeacher) {
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
      if (
        value === "ish-haqi" &&
        canSeeSalary &&
        isTeacher &&
        !salaryShown.current
      ) {
        salaryShown.current = true;
        setSalaryVisible(true);
        setSalaryLoading(true);
        api
          .get(`/teachers/${employee.id}/salary-summary`)
          .then((res) => setSalarySummary(res.data))
          .catch(() => {})
          .finally(() => setSalaryLoading(false));
      }
    },
    [fetchGroups, employee.id, isTeacher, canSeeSalary],
  );

  // Trigger lazy-load on direct URL navigation (e.g. ?tab=tarix on first load).
  useEffect(() => {
    if (activeTab) activateTab(activeTab);
  }, [activeTab, activateTab]);

  const handleTabChange = (value: string) => {
    onTabChange?.(value);
    activateTab(value);
  };

  return (
    <Tabs
      value={activeTab ?? defaultTab}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="w-full justify-start overflow-x-auto sticky top-0 z-10 bg-background md:static">
        {isTeacher && <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>}
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
        {canSeeTimeline && (
          <TabsTrigger value="taymlayn">Taymlayn</TabsTrigger>
        )}
        {canSeeSalary && isTeacher && (
          <TabsTrigger value="ish-haqi">Ish haqi</TabsTrigger>
        )}
      </TabsList>

      {/* Guruhlar — faqat o'qituvchilar uchun */}
      {isTeacher && (
        <TabsContent value="guruhlar">
          {groupsLoading ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <TeacherGroupsTable groups={groups} />
          )}
        </TabsContent>
      )}

      {/* Izohlar */}
      <TabsContent value="izohlar">
        {commentsVisible ? (
          <div className="space-y-4">
            <CommentForm
              entityType="User"
              entityId={employee.id}
              onOptimisticAdd={handleOptimisticAdd}
              onConfirmed={handleConfirmed}
              onFailed={handleFailed}
            />
            <CommentList
              entityType="User"
              entityId={employee.id}
              optimisticComments={optimisticComments}
              onCommentChange={onCommentChange}
            />
          </div>
        ) : (
          <EmptyState message="Izohlar mavjud emas" />
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="User" entityId={employee.id} />
        ) : (
          <EmptyState message="Tarix mavjud emas" />
        )}
      </TabsContent>

      {/* Taymlayn — CEO / BD / Administrator */}
      {canSeeTimeline && (
        <TabsContent value="taymlayn">
          <TeacherTimelineTab teacherId={employee.id} />
        </TabsContent>
      )}

      {/* Ish haqi — faqat CEO va Branch Director, o'qituvchi uchun */}
      {canSeeSalary && isTeacher && (
        <TabsContent value="ish-haqi">
          {salaryVisible && (
            <div className="space-y-6">
              {/* The money — same row /payments/salary renders. */}
              <SalaryMonthlyPanel userId={employee.id} scope="admin" />

              {/* Context behind it: groups, students, rates. */}
              {salaryLoading ? (
                <div className="flex h-24 items-center justify-center rounded-md border">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : salarySummary ? (
                <TeacherGroupsRateList summary={salarySummary} />
              ) : null}

              <PossibleDeductionsInfo variant="teacher" />
            </div>
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
