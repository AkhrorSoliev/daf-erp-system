"use client";

import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useTasksBoard, type TaskTab } from "@/hooks/use-tasks-board";
import { TaskKanbanBoard } from "./task-kanban-board";

export function TasksBoardClient() {
  const user = useAuth((s) => s.user);
  const { tab, setTab, fetchMyTasks, fetchCreatedTasks, loading } =
    useTasksBoard();

  const canSeeBothTabs =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  useEffect(() => {
    if (tab === "my") {
      fetchMyTasks();
    } else {
      fetchCreatedTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function handleTabChange(value: string) {
    setTab(value as TaskTab);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Topshiriqlar</h1>
      </div>

      {canSeeBothTabs ? (
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="my">Menga berilgan</TabsTrigger>
            <TabsTrigger value="created">Men bergan</TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="mt-4">
            <TaskKanbanBoard loading={loading} isDragDisabled={false} />
          </TabsContent>
          <TabsContent value="created" className="mt-4">
            <TaskKanbanBoard loading={loading} isDragDisabled />
          </TabsContent>
        </Tabs>
      ) : (
        <TaskKanbanBoard loading={loading} isDragDisabled={false} />
      )}
    </div>
  );
}
