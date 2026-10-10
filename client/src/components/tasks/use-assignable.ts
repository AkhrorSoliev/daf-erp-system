import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface AssignableUser {
  id: number; firstName: string; lastName: string; photo: string | null;
  roleNames: string[]; branchNames: string[]; telegramLinked: boolean;
}

/** Whom the caller may give a task to or add as a watcher; shared by the filters and the create dialog. */
export function useAssignable(enabled = true) {
  return useQuery({
    queryKey: ["tasks", "assignable"],
    queryFn: async () => (await api.get<{ assignees: AssignableUser[]; watchers: AssignableUser[] }>("/tasks/assignable")).data,
    staleTime: 5 * 60_000,
    enabled,
  });
}
