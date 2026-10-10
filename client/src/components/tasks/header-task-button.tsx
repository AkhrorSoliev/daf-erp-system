"use client";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { TaskCreateDialog, useTaskCreate } from "./task-create-dialog";
import { useEntityContext } from "./entity-context";

// Staff roles 1-5: the same band the server treats as able to hold tasks (task-policy `highestRoleId`).
const isStaff = (roles: { id: number }[]) => roles.some((r) => r.id >= 1 && r.id <= 5);

/** «+ Topshiriq» in the header, and the one `TaskCreateDialog` every dashboard page opens through `useTaskCreate`. */
export function HeaderTaskButton() {
  const user = useAuth((s) => s.user);
  const open = useTaskCreate((s) => s.open);
  const ctx = useEntityContext((s) => s.context);
  const pathname = usePathname();
  if (!user || !isStaff(user.roles)) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1 px-2"
        aria-label="Yangi topshiriq"
        onClick={() => open(ctx?.pathname === pathname ? ctx : {})}
      >
        <Plus className="size-4" /><span className="hidden sm:inline">Topshiriq</span>
      </Button>
      <TaskCreateDialog />
    </>
  );
}
