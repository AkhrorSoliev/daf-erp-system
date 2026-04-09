"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditEmployee, type EmployeeUser } from "@/hooks/use-edit-employee";
import { useAuth } from "@/hooks/use-auth";

interface EmployeeRowActionsProps {
  employee: EmployeeUser;
  onDelete?: (id: number) => void;
}

export function EmployeeRowActions({ employee, onDelete }: EmployeeRowActionsProps) {
  const { openDrawer } = useEditEmployee();
  const user = useAuth((s) => s.user);
  const canDelete = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Amallar</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Amallar</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openDrawer(employee)}>
          <Pencil className="mr-2 size-4" />
          Tahrirlash
        </DropdownMenuItem>
        {canDelete && employee.id !== user?.id && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete?.(employee.id)}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;chirish
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
