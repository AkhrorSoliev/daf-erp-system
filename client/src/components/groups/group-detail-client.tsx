"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupInfoCard } from "./group-info-card";
import { GroupDetailTabs } from "./group-detail-tabs";
import { EditGroupDrawer } from "./edit-group-drawer";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { GroupData } from "@/hooks/use-edit-group";
import api from "@/lib/api";

interface GroupDetailClientProps {
  id: string;
}

export function GroupDetailClient({ id }: GroupDetailClientProps) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, setName]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="space-y-3 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex gap-2 border-b pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
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
          <GroupInfoCard group={group} commentKey={commentKey} onWriteComment={handleWriteComment} />
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
