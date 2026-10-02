"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupInfoCard } from "./group-info-card";
import { GroupDetailTabs } from "./group-detail-tabs";
import { EditGroupDrawer } from "./edit-group-drawer";
import { otherBranchOf, type OtherBranch } from "./group-other-branch";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { GroupData } from "@/hooks/use-edit-group";
import api from "@/lib/api";

interface GroupDetailClientProps {
  id: string;
}

export function GroupDetailClient({ id }: GroupDetailClientProps) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [otherBranch, setOtherBranch] = useState<OtherBranch | null>(null);
  const [commentKey, setCommentKey] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabFromUrl = searchParams.get("tab") ?? "davomat";
  const [activeTab, setActiveTabState] = useState(tabFromUrl);
  const [commentFocusKey, setCommentFocusKey] = useState(0);
  const setName = useBreadcrumbName((s) => s.setName);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "davomat") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const handleCommentChange = useCallback(() => {
    setCommentKey((k) => k + 1);
  }, []);

  const handleWriteComment = useCallback(() => {
    setActiveTab("izohlar");
    setCommentFocusKey((k) => k + 1);
  }, []);

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/groups/${id}`);
      setGroup(data);
      setName(id, data.name);
      setError(false);
      setOtherBranch(null);
    } catch (err) {
      setError(true);
      setOtherBranch(otherBranchOf(err));
    } finally {
      setLoading(false);
    }
  }, [id, setName]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (otherBranch) {
    return <GroupInOtherBranch branch={otherBranch} />;
  }

  if (error || !group) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Guruh topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {id} bo&apos;yicha guruh mavjud emas
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <GroupInfoCard
            group={group}
            commentKey={commentKey}
            onWriteComment={handleWriteComment}
            onStatusChanged={fetchGroup}
          />
        </div>
        <div className="min-w-0 flex-1">
          <GroupDetailTabs
            group={group}
            onCommentChange={handleCommentChange}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            commentFocusKey={commentFocusKey}
          />
        </div>
      </div>
      <EditGroupDrawer
        onSaved={(updated) => {
          setGroup(updated);
          setName(id, updated.name);
        }}
      />
    </>
  );
}

/**
 * The group exists, but in another of the caller's branches. Switching the
 * branch remounts the page (`scopeVersion`), which loads the group there.
 */
function GroupInOtherBranch({ branch }: { branch: OtherBranch }) {
  const target = useBranchSwitcher((s) =>
    s.branches.find((b) => b.id === branch.id),
  );
  const selectBranch = useBranchSwitcher((s) => s.selectBranch);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Guruh boshqa filialda
      </h1>
      <p className="text-muted-foreground">
        Bu guruh «{branch.name}» filialiga tegishli. Uni ko&apos;rish uchun shu
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
