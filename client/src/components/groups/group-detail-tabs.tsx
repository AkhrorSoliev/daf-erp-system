"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GroupStudentsTable,
  type GroupStudent,
} from "./group-students-table";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import type { GroupData } from "@/hooks/use-edit-group";
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
}

export function GroupDetailTabs({ group }: GroupDetailTabsProps) {
  const [students, setStudents] = useState<GroupStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const studentsFetched = useRef(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const historyShown = useRef(false);

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

  const handleTabChange = (value: string) => {
    if (value === "oquvchilar") fetchStudents();
    if (value === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    }
  };

  return (
    <Tabs
      defaultValue="oquvchilar"
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="oquvchilar">O&apos;quvchilar</TabsTrigger>
        <TabsTrigger value="davomat">Davomat</TabsTrigger>
        <TabsTrigger value="materiallar">Materiallar</TabsTrigger>
        <TabsTrigger value="imtihonlar">Imtihonlar</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
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
        <EmptyState message="Davomat ma'lumotlari mavjud emas" />
      </TabsContent>

      {/* Materiallar */}
      <TabsContent value="materiallar">
        <EmptyState message="Materiallar mavjud emas" />
      </TabsContent>

      {/* Imtihonlar */}
      <TabsContent value="imtihonlar">
        <EmptyState message="Imtihonlar mavjud emas" />
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="Group" entityId={group.id} />
        ) : (
          <EmptyState message="Tarix mavjud emas" />
        )}
      </TabsContent>

      {/* Izohlar */}
      <TabsContent value="izohlar">
        <EmptyState message="Izohlar mavjud emas" />
      </TabsContent>
    </Tabs>
  );
}
