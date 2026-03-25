"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { cn } from "@/lib/utils";

export function BranchSwitcher() {
  const { branches, selectedBranch, selectBranch } = useBranchSwitcher();
  const activeBranches = branches.filter((b) => b.status === "active");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Building2 className="size-4 text-muted-foreground" />
              <span className="max-w-[150px] truncate">{selectedBranch.name}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filialni tanlash</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        {activeBranches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => selectBranch(branch)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span>{branch.name}</span>
            </div>
            {selectedBranch.id === branch.id && (
              <Check className={cn("size-4 text-primary")} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
