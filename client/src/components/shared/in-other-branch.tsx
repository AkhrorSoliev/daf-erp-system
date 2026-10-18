"use client";

import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useT } from "@/i18n/context";
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
  /** Which record it is; each has its own sentence (no word is glued into another language). */
  what: "guruh" | "o'quvchi";
  branch: OtherBranch;
}) {
  const t = useT();
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
        {what === "guruh"
          ? t("Bu guruh «{branch}» filialiga tegishli. Uni ko'rish uchun shu filialni tanlang.", { branch: branch.name })
          : t("Bu o'quvchi «{branch}» filialiga tegishli. Uni ko'rish uchun shu filialni tanlang.", { branch: branch.name })}
      </p>
      {target && (
        <Button onClick={() => selectBranch(target)}>
          <Building2 className="size-4" />
          {t("{branch}ga o'tish", { branch: branch.name })}
        </Button>
      )}
    </div>
  );
}
