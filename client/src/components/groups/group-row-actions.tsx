"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { StatusHistoryDialog } from "@/components/shared/status-history-dialog";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { GroupDeleteDialog } from "./group-delete-dialog";

interface GroupRowActionsProps {
  group: GroupData;
  onDeleted?: (id: string) => void;
  onStatusChanged?: (id: string, newStatus: string) => void;
}

export function GroupRowActions({ group, onDeleted, onStatusChanged }: GroupRowActionsProps) {
  const { openDrawer } = useEditGroup();
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
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
          <DropdownMenuItem onClick={() => openDrawer(group)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowStatus(true)}>
            <RefreshCw className="mr-2 size-4" />
            Status o&apos;zgartirish
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowHistory(true)}>
            <History className="mr-2 size-4" />
            Status tarixi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="mr-2 size-4" />
            O&apos;chirish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GroupDeleteDialog
        group={group}
        open={showDelete}
        onOpenChange={setShowDelete}
        onDeleted={onDeleted}
      />

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="groups"
        entityId={group.id}
        entityName={group.name}
        currentStatus={group.statusEnum || "FORMING"}
        onStatusChanged={(newStatus) => onStatusChanged?.(group.id, newStatus)}
      />

      <StatusHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        entityType="groups"
        entityId={group.id}
        entityName={group.name}
      />
    </>
  );
}
