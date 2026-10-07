import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useNotifications } from "@/hooks/use-notifications";
import { useTasks } from "@/hooks/use-tasks";

export interface TaskCounts { my: number; myOverdue: number; created: number; review: number }
const ZERO: TaskCounts = { my: 0, myOverdue: 0, created: 0, review: 0 };

export function useTaskCounts(): TaskCounts & { refetch: () => void } {
  const { data = ZERO, refetch } = useQuery({
    queryKey: ["tasks", "counts"],
    queryFn: async () => (await api.get<TaskCounts>("/tasks/counts")).data,
    staleTime: 0, refetchInterval: 60_000, refetchOnWindowFocus: true,
  });
  const lastNotificationId = useNotifications((s) => s.notifications[0]?.id);
  // A number the store bumps when a card changes, not the `columns` object: that
  // gets a new identity on every loading flag and would refetch for nothing.
  const version = useTasks((s) => s.version);
  useEffect(() => { void refetch({ cancelRefetch: false }); }, [lastNotificationId, version, refetch]);
  return { ...data, refetch: () => void refetch() };
}
