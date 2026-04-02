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

  // O'quvchilar is the default tab — fetch on mount
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Handle external tab switches (e.g. "Izoh yozish" button in info card)
  useEffect(() => {
    if (activeTab === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    onTabChange?.(value);
    if (value === "oquvchilar") fetchStudents();
    if (value === "davomat" && !attendanceShown.current) {
      attendanceShown.current = true;
      setAttendanceVisible(true);
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

  return (
    <Tabs
      value={activeTab ?? "oquvchilar"}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="oquvchilar">O&apos;quvchilar</TabsTrigger>
        <TabsTrigger value="davomat">Davomat</TabsTrigger>
        <TabsTrigger value="materiallar">Materiallar</TabsTrigger>
        <TabsTrigger value="imtihonlar">Imtihonlar</TabsTrigger>
        {canManage && <TabsTrigger value="tarix">Tarix</TabsTrigger>}
        {canManage && <TabsTrigger value="izohlar">Izohlar</TabsTrigger>}
      </TabsList>

      {/* O'quvchilar */}
      <TabsContent value="oquvchilar">
        {studentsLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        ) : (
          <GroupStudentsTable students={students} />
        )}
      </TabsContent>

      {/* Davomat */}
      <TabsContent value="davomat">
        {attendanceVisible ? (
          <AttendanceTab group={group} />
        ) : (
          <EmptyState message="Davomat ma'lumotlari mavjud emas" />
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
            <EntityHistoryTable entityType="Group" entityId={group.id} />
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
    </Tabs>
  );
}
