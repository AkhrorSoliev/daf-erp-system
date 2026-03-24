"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditBranch } from "@/hooks/use-edit-branch";
import { EditBranchDrawer } from "./edit-branch-drawer";
import type { Branch } from "@/hooks/use-edit-branch";

interface BranchDetailClientProps {
  branch: Branch;
}

export function BranchDetailClient({ branch }: BranchDetailClientProps) {
  const router = useRouter();
  const openDrawer = useEditBranch((s) => s.openDrawer);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/settings/branches")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Orqaga</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{branch.name}</h2>
            <Badge variant={branch.status === "active" ? "default" : "secondary"}>
              {branch.status === "active" ? "Faol" : "Nofaol"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">ID: {branch.id}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => openDrawer(branch)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filialni tahrirlash</TooltipContent>
        </Tooltip>
      </div>

      <EditBranchDrawer />
    </div>
  );
}
