"use client";

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

export function DashboardClient() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Bosh sahifa
        </h1>
        <p className="text-muted-foreground">
          DaF Sprachzentrum ERP tizimiga xush kelibsiz
        </p>
      </div>

      {selectedBranch && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Joriy filial</p>
              <div className="flex items-center gap-2">
                <p className="font-medium">{selectedBranch.name}</p>
                <Badge variant="outline">ID: {selectedBranch.id}</Badge>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
