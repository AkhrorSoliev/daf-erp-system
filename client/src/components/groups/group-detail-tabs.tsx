"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GroupStudentsTable,
  type GroupStudent,
} from "./group-students-table";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentForm } from "@/components/shared/comment-form";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { AttendanceTab } from "./attendance/attendance-tab";
import { AttendanceStats } from "./attendance/attendance-stats";
import { AttendanceDotsTab } from "./attendance/attendance-dots-tab";
import { EditStudentDrawer } from "@/components/students/edit-student-drawer";
import type { GroupData } from "@/hooks/use-edit-group";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface GroupDetailTabsProps {
  group: GroupData;
  onCommentChange?: () => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  commentFocusKey?: number;
}

export function GroupDetailTabs({ group, onCommentChange, activeTab, onTabChange, commentFocusKey }: GroupDetailTabsProps) {
  const user = useAuth((s) => s.user);
  const canManage =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [students, setStudents] = useState<GroupStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const studentsFetched = useRef(false);
  const [attendanceVisible, setAttendanceVisible] = useState(false);
  const attendanceShown = useRef(false);
  const [dotsVisible, setDotsVisible] = useState(false);
  const dotsShown = useRef(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsShown = useRef(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const historyShown = useRef(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const commentsShown = useRef(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback((tempId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
    onCommentChange?.();
  }, [onCommentChange]);

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? { ...c, _pending: false, _failed: true } : c)),
    );
  }, []);

  const fetchStudents = useCallback(async () => {
    if (studentsFetched.current) return;
    studentsFetched.current = true;
    setStudentsLoading(true);
    try {
      const { data } = await api.get(`/groups/${group.id}/students`);
      setStudents(data);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, [group.id]);

  // On mount (or when activeTab changes externally), activate the correct tab's data
  useEffect(() => {
    const tab = activeTab ?? "davomat";
    if (tab === "davomat" && !attendanceShown.current) {
      attendanceShown.current = true;
      setAttendanceVisible(true);
    } else if (tab === "darslar" && !dotsShown.current) {
      dotsShown.current = true;
      setDotsVisible(true);
    } else if (tab === "oquvchilar") {
      fetchStudents();
    } else if (tab === "statistika" && !statsShown.current) {
      statsShown.current = true;
      setStatsVisible(true);
    } else if (tab === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    } else if (tab === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
  }, [activeTab, fetchStudents]);

  const handleTabChange = (value: string) => {
    onTabChange?.(value);
    if (value === "oquvchilar") fetchStudents();
    if (value === "davomat" && !attendanceShown.current) {
      attendanceShown.current = true;
      setAttendanceVisible(true);
    }
    if (value === "darslar" && !dotsShown.current) {
      dotsShown.current = true;
      setDotsVisible(true);
    }
    if (value === "statistika" && !statsShown.current) {
      statsShown.current = true;
      setStatsVisible(true);
    }
    if (value === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    }
    if (value === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
  };

  const handleStudentSaved = useCallback(() => {
    studentsFetched.current = false;
    fetchStudents();
  }, [fetchStudents]);

  return (
    <>
    <EditStudentDrawer onSaved={handleStudentSaved} />
    <Tabs
      value={activeTab ?? "davomat"}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="davomat">Davomat</TabsTrigger>
        <TabsTrigger value="darslar">Darslar</TabsTrigger>
        <TabsTrigger value="oquvchilar">O&apos;quvchilar</TabsTrigger>
        <TabsTrigger value="materiallar">Materiallar</TabsTrigger>
        <TabsTrigger value="imtihonlar">Imtihonlar</TabsTrigger>
        {canManage && <TabsTrigger value="tarix">Tarix</TabsTrigger>}
        {canManage && <TabsTrigger value="izohlar">Izohlar</TabsTrigger>}
        <TabsTrigger value="statistika">Statistika</TabsTrigger>
      </TabsList>

      {/* Davomat */}
      <TabsContent value="davomat">
        {attendanceVisible ? (
          <AttendanceTab group={group} />
        ) : (
          <EmptyState message="Davomat ma'lumotlari mavjud emas" />
        )}
      </TabsContent>

      {/* Darslar ketma-ketligi */}
      <TabsContent value="darslar">
        {dotsVisible ? (
          <AttendanceDotsTab group={group} />
        ) : (
          <EmptyState message="Darslar ma'lumotlari mavjud emas" />
        )}
      </TabsContent>

      {/* O'quvchilar */}
      <TabsContent value="oquvchilar">
        {studentsLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : (
          <GroupStudentsTable
            students={students}
            onStudentDeleted={(id) => setStudents((prev) => prev.filter((s) => s.id !== id))}
          />
        )}
      </TabsContent>

      {/* Materiallar */}
      <TabsContent value="materiallar">
        <EmptyState message="Materiallar mavjud emas" />
      </TabsContent>

      {/* Imtihonlar */}
      <TabsContent value="imtihonlar">
        <EmptyState message="Imtihonlar mavjud emas" />
      </TabsContent>

      {/* Tarix (faqat CEO, BD, Admin) */}
      {canManage && (
        <TabsContent value="tarix">
          {historyVisible ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Davomat tarixi</h3>
                <EntityHistoryTable entityType="GroupAttendance" entityId={group.id} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Guruh o&apos;zgarishlari</h3>
                <EntityHistoryTable entityType="Group" entityId={group.id} />
              </div>
            </div>
          ) : (
            <EmptyState message="Tarix mavjud emas" />
          )}
        </TabsContent>
      )}

      {/* Izohlar (faqat CEO, BD, Admin) */}
      {canManage && (
        <TabsContent value="izohlar">
          {commentsVisible ? (
            <div className="space-y-4">
              <CommentForm
                entityType="Group"
                entityId={group.id}
                onOptimisticAdd={handleOptimisticAdd}
                onConfirmed={handleConfirmed}
                onFailed={handleFailed}
                focusKey={commentFocusKey}
              />
              <CommentList
                entityType="Group"
                entityId={group.id}
                optimisticComments={optimisticComments}
                onCommentChange={onCommentChange}
              />
            </div>
          ) : (
            <EmptyState message="Izohlar mavjud emas" />
          )}
        </TabsContent>
      )}

      {/* Statistika */}
      <TabsContent value="statistika">
        {statsVisible ? (
          <AttendanceStats group={group} />
        ) : (
          <EmptyState message="Statistika mavjud emas" />
        )}
      </TabsContent>
    </Tabs>
    </>
  );
}
