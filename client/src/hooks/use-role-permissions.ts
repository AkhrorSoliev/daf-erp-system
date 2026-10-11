import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { usePermissions } from "@/hooks/use-permissions";
import type {
  PermissionHistoryPage,
  PermissionsOverview,
  RoleKeys,
  RolePermissionChange,
} from "@/components/settings/permissions/permissions-types";

/** The «Ruxsatlar» page's data (ADR-0086). Every route is CEO-only on the server. */
export const ROLE_PERMISSIONS_KEY = ["permissions", "overview"] as const;
export const ROLE_PERMISSIONS_HISTORY_KEY = ["permissions", "history"] as const;
export const HISTORY_PAGE_SIZE = 20;

/** `GET /permissions` — the catalog, the locks and each role's keys. */
export function useRolePermissions() {
  return useQuery({
    queryKey: ROLE_PERMISSIONS_KEY,
    queryFn: () => api.get<PermissionsOverview>("/permissions").then((r) => r.data),
  });
}

/** `GET /permissions/history` — 20 per page; the previous page stays on screen while the next loads. */
export function useRolePermissionsHistory(page: number) {
  return useQuery({
    queryKey: [...ROLE_PERMISSIONS_HISTORY_KEY, page],
    queryFn: () =>
      api
        .get<PermissionHistoryPage>("/permissions/history", {
          params: { page, pageSize: HISTORY_PAGE_SIZE },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

/**
 * After a save or a reset: the table and the history read again (awaited, so
 * `isPending` lasts until the switches show the server's answer — no
 * optimistic update), then the signed-in user's own list.
 */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ROLE_PERMISSIONS_HISTORY_KEY }),
      ]);
      void usePermissions.getState().refresh();
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi"));
    },
  };
}

/** `PUT /permissions/roles/:roleId` — the confirmed toggle with its dependencies. */
export function useSaveRolePermissions() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: ({ roleId, changes }: { roleId: number; changes: RolePermissionChange[] }) =>
      api.put<RoleKeys>(`/permissions/roles/${roleId}`, { changes }).then((r) => r.data),
    ...after,
  });
}

/** `POST /permissions/roles/:roleId/reset` — back to the catalog default. */
export function useResetRolePermissions() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: ({ roleId }: { roleId: number }) =>
      api.post<RoleKeys>(`/permissions/roles/${roleId}/reset`).then((r) => r.data),
    ...after,
  });
}
