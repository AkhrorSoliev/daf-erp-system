import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useNotifications } from "@/hooks/use-notifications";
import { useTasksBoard } from "@/hooks/use-tasks-board";

/**
 * How many of my tasks still sit in «Kutilmoqda». The sidebar marks the
 * «Topshiriqlar» row while it is above zero. `GET /comments/my-tasks` is keyed
 * on the assignee, so the count covers every branch, like the board.
 */
export function usePendingTaskCount(): number {
  const { data = 0, refetch } = useQuery({
    queryKey: ["tasks", "pending-count"],
    queryFn: async () => {
      const res = await api.get("/comments/my-tasks", {
        params: { status: "PENDING", pageSize: 1 },
      });
      return Number(res.data?.total) || 0;
    },
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // A new notification (a task assigned) or a card moved on the board can
  // change the count; recount then instead of waiting for the interval.
  const lastNotificationId = useNotifications((s) => s.notifications[0]?.id);
  const boardTasks = useTasksBoard((s) => s.tasks);
  useEffect(() => {
    void refetch({ cancelRefetch: false });
  }, [lastNotificationId, boardTasks, refetch]);

  return data;
}
