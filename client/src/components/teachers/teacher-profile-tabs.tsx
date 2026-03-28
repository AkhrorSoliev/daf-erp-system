"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeacherGroupsTable } from "./teacher-groups-table";
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
  };

  return (
    <Tabs defaultValue="guruhlar" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
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

      {/* Tarix */}
      <TabsContent value="tarix">
        <EmptyState message="Tarix ma'lumotlari mavjud emas" />
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
