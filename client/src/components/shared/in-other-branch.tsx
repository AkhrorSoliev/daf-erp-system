"use client";

import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { OtherBranch } from "@/lib/other-branch";

/**
 * A detail page whose record is in another of the caller's branches
 * (`otherBranchOf`). Switching the branch remounts the page (`scopeVersion`),
 * which then loads the record there.
 */
export function InOtherBranch({
  title,
  what,
  branch,
}: {
  title: string;
  /** "guruh", "o'quvchi" — fills «Bu … filialiga tegishli». */
  what: string;
  branch: OtherBranch;
}) {
  const target = useBranchSwitcher((s) =>
    s.branches.find((b) => b.id === branch.id),
  );
  const selectBranch = useBranchSwitcher((s) => s.selectBranch);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground">
        Bu {what} «{branch.name}» filialiga tegishli. Uni ko&apos;rish uchun shu
        filialni tanlang.
      </p>
      {target && (
        <Button onClick={() => selectBranch(target)}>
          <Building2 className="size-4" />
          {branch.name}ga o&apos;tish
        </Button>
      )}
    </div>
  );
}
