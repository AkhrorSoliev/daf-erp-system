"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { isTeacherOnly } from "@/lib/teacher-only";
import { formatWeekdays } from "@/lib/weekdays";
import { GroupInfoCard } from "./group-info-card";
import { GroupDetailTabs } from "./group-detail-tabs";
import { EditGroupDrawer } from "./edit-group-drawer";
import { InOtherBranch } from "@/components/shared/in-other-branch";
import { otherBranchOf, type OtherBranch } from "@/lib/other-branch";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import { usePublishEntity } from "@/components/tasks/entity-context";
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
  // The URL is the one source of the tab: the teacher's bottom bar changes it
  // from outside this component, and the page follows.
  const activeTab = searchParams.get("tab") ?? "davomat";
  const [commentFocusKey, setCommentFocusKey] = useState(0);
  const setName = useBreadcrumbName((s) => s.setName);
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const collapseInfo = isMobile && isTeacherOnly(user?.roles);

  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // Leaving the attendance tab also leaves its open form.
    params.delete("sana");
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

  usePublishEntity("Group", group?.id ?? null, group?.name ?? "");

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (otherBranch) {
    return (
      <InOtherBranch what="guruh" branch={otherBranch} />
    );
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
          {collapseInfo ? (
            // Phone teacher: attendance comes first, the full card is one tap away.
            <details className="group rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{group.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      group.exactDays?.length > 0 ? formatWeekdays(group.exactDays) : null,
                      group.lessonStartTime && group.lessonEndTime
                        ? `${group.lessonStartTime} – ${group.lessonEndTime}`
                        : null,
                      group.room?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <GroupInfoCard
                group={group}
                commentKey={commentKey}
                onWriteComment={handleWriteComment}
                onStatusChanged={fetchGroup}
              />
            </details>
          ) : (
            <GroupInfoCard
              group={group}
              commentKey={commentKey}
              onWriteComment={handleWriteComment}
              onStatusChanged={fetchGroup}
            />
          )}
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

