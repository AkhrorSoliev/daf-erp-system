"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeacherGroupsTable } from "./teacher-groups-table";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import type { TeacherData } from "@/hooks/use-edit-teacher";
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

interface TeacherProfileTabsProps {
  teacher: TeacherData;
}

export function TeacherProfileTabs({ teacher }: TeacherProfileTabsProps) {
  const user = useAuth((s) => s.user);
  const canSeeSalary =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const groupsFetched = useRef(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);

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

  const handleTabChange = (value: string) => {
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
  };

  return (
    <Tabs defaultValue="guruhlar" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="w-full justify-start overflow-x-auto sticky top-0 z-10 bg-background md:static">
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
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

      {/* Ish haqi — faqat CEO va Branch Director */}
      {canSeeSalary && (
        <TabsContent value="ish-haqi">
          <EmptyState message="Ish haqi ma'lumotlari mavjud emas" />
        </TabsContent>
      )}
    </Tabs>
  );
}
