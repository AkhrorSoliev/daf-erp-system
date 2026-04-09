"use client";

import { useEffect } from "react";
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
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function BranchSwitcher() {
  const { user } = useAuth();
  const { branches, selectedBranch, selectBranch, fetchBranches } =
    useBranchSwitcher();

  const isCeo = user?.roles.some((r) => r.name === "CEO");

  useEffect(() => {
    if (isCeo) {
      fetchBranches();
    } else if (user) {
      // Non-CEO rollar uchun user.branches dan loaded holatini o'rnatish
      const userBranches = (user.branches ?? []).map((b) => ({ id: b.id, name: b.name }));
      const savedBranchId = localStorage.getItem("branchId");
      const savedBranch = savedBranchId
        ? userBranches.find((b) => b.id === Number(savedBranchId))
        : null;
      const selected = savedBranch ?? userBranches[0] ?? null;
      if (selected) {
        localStorage.setItem("branchId", String(selected.id));
      }
      useBranchSwitcher.setState({
        branches: userBranches,
        selectedBranch: useBranchSwitcher.getState().selectedBranch ?? selected,
        loaded: true,
      });
    }
  }, [isCeo, user, fetchBranches]);

  // CEO bo'lmasa yoki branchlar yuklanmagan bo'lsa, user ning o'z branchlarini ko'rsatamiz
  const displayBranches = isCeo
    ? branches
    : (user?.branches ?? []).map((b) => ({ id: b.id, name: b.name }));

  const selected =
    selectedBranch ?? (displayBranches.length > 0 ? displayBranches[0] : null);

  if (!selected || displayBranches.length === 0) return null;

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
              <span className="max-w-[150px] truncate">{selected.name}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filialni tanlash</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        {displayBranches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => {
              if (branch.id !== selected.id) {
                selectBranch(branch);
              }
            }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span>{branch.name}</span>
            </div>
            {selected.id === branch.id && (
              <Check className={cn("size-4 text-primary")} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
