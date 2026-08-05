"use client";

import { useEffect } from "react";
import { Building2, Check, ChevronsUpDown, Layers } from "lucide-react";
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const ALL_BRANCHES_LABEL = "Barcha filiallar";

export function BranchSwitcher() {
  const { user } = useAuth();
  const {
    branches,
    selectedBranch,
    canSelectAll,
    selectBranch,
    fetchBranches,
    hydrateFor,
  } = useBranchSwitcher();

  const isCeo = user?.roles.some((r) => r.name === "CEO") ?? false;

  useEffect(() => {
    if (!user) return;
    if (isCeo) {
      // `GET /branches` returns the caller's ceiling, so for a CEO that is every
      // branch in the company.
      useBranchSwitcher.setState({ canSelectAll: true });
      void fetchBranches();
      return;
    }
    // Non-CEO: seed from the signed-in user's own branches. No "Barcha
    // filiallar" — a confined caller has no consolidated view to show, and the
    // server would refuse it anyway.
    hydrateFor(
      (user.branches ?? []).map((b) => ({ id: b.id, name: b.name })),
      false,
    );
  }, [isCeo, user, fetchBranches, hydrateFor]);

  const label = selectedBranch?.name ?? ALL_BRANCHES_LABEL;

  // A confined user with no branch at all has nothing to switch between, and
  // rendering an empty dropdown would suggest otherwise.
  if (!canSelectAll && branches.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              {selectedBranch ? (
                <Building2 className="size-4 text-muted-foreground" />
              ) : (
                <Layers className="size-4 text-muted-foreground" />
              )}
              <span className="max-w-[150px] truncate">{label}</span>
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filialni tanlash</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        {canSelectAll && (
          <>
            <DropdownMenuItem
              onClick={() => {
                if (selectedBranch !== null) selectBranch(null);
              }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                <span>{ALL_BRANCHES_LABEL}</span>
              </div>
              {selectedBranch === null && (
                <Check className={cn("size-4 text-primary")} />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => {
              if (branch.id !== selectedBranch?.id) {
                selectBranch(branch);
              }
            }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span>{branch.name}</span>
            </div>
            {selectedBranch?.id === branch.id && (
              <Check className={cn("size-4 text-primary")} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
