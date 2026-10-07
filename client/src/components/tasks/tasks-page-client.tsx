"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTasks, type TaskView } from "@/hooks/use-tasks";
import { useTaskCounts } from "@/hooks/use-task-counts";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskFilters } from "./task-filters";
import { TaskCreateDialog, useTaskCreate } from "./task-create-dialog";
import { TaskDrawer } from "./task-drawer";
import { TaskAllTable } from "./task-all-table";
import { TaskWorkload } from "./task-workload";

const TABS: TaskView[] = ["my", "created", "all", "workload"];
const MANAGER_ROLES = [1, 2];

// No useBranchChange here: BranchScopedMain remounts this page on a branch
// switch, after BranchQuerySync has reset the store, so the mount effect below
// already loads the new branch's board.
export function TasksPageClient() {
  const user = useAuth((s) => s.user);
  const isManager = user?.roles.some((r) => MANAGER_ROLES.includes(r.id)) ?? false;
  const layout = useTasks((s) => s.layout);
  const setLayout = useTasks((s) => s.setLayout);
  const openTask = useTasks((s) => s.openTask);
  const counts = useTaskCounts();
  const openCreate = useTaskCreate((s) => s.open);
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Only the four known tabs; «Barchasi» and «Yuklama» are for managers.
  const asked = TABS.find((t) => t === searchParams.get("tab")) ?? "my";
  const tab: TaskView = (asked === "all" || asked === "workload") && !isManager ? "my" : asked;
  const urlTask = searchParams.get("task");

  // A tab switch is a different list: set the view and load its board (once).
  // Not before the user is known: auth hydrates in an effect, and a manager's
  // `?tab=all` would first resolve to «my» and fetch it for nothing.
  const ready = !!user;
  useEffect(() => {
    if (!ready || tab === "workload") return;
    const s = useTasks.getState();
    if (s.view !== tab) s.setView(tab);
    // Each tab has one of the two person filters: «Menga berilgan» filters by
    // author, the others by assignee. One left over from another tab would
    // silently narrow (or empty) this one.
    const left = tab === "my" ? s.filters.assigneeId : s.filters.authorId;
    if (left?.length) s.setFilters({ ...s.filters, ...(tab === "my" ? { assigneeId: undefined } : { authorId: undefined }) });
    if (tab !== "all") void s.fetchBoard();
  }, [tab, ready]);
  // The link opens a task once per change of `?task=`; closing it strips the param.
  useEffect(() => { if (urlTask) openTask(urlTask); }, [urlTask, openTask]);
  // A phone gets the list (the board is for a wide screen).
  useEffect(() => { if (isMobile) setLayout("list"); }, [isMobile, setLayout]);

  const editParams = useCallback((edit: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    edit(p);
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);
  const setTab = (next: string) => editParams((p) => (next === "my" ? p.delete("tab") : p.set("tab", next)));
  const closeTask = () => { openTask(null); editParams((p) => p.delete("task")); };

  const showBoard = tab === "my" || tab === "created";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Topshiriqlar</h1>
        <Button onClick={() => openCreate({})}><Plus className="mr-1 size-4" />Yangi topshiriq</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={setTab} className="max-w-full overflow-x-auto">
          <TabsList>
            <TabsTrigger value="my">Menga berilgan <span className="ml-1 text-muted-foreground">{counts.my}</span></TabsTrigger>
            <TabsTrigger value="created">Men bergan <span className="ml-1 text-muted-foreground">{counts.created}</span></TabsTrigger>
            {isManager && <TabsTrigger value="all">Barchasi</TabsTrigger>}
            {isManager && <TabsTrigger value="workload">Yuklama</TabsTrigger>}
          </TabsList>
        </Tabs>
        {showBoard && (
          <Tabs value={layout} onValueChange={(v) => setLayout(v as "board" | "list")}>
            <TabsList>
              <TabsTrigger value="board"><LayoutGrid className="size-4" /><span className="ml-1 hidden sm:inline">Doska</span></TabsTrigger>
              <TabsTrigger value="list"><List className="size-4" /><span className="ml-1 hidden sm:inline">Ro&apos;yxat</span></TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {showBoard && <TaskFilters />}
      {tab === "my" && (layout === "board" ? <TaskBoard dragEnabled showAssignees={false} /> : <TaskList showAssignees={false} />)}
      {tab === "created" && (layout === "board" ? <TaskBoard dragEnabled={false} showAssignees /> : <TaskList showAssignees />)}
      {tab === "all" && <TaskAllTable />}
      {tab === "workload" && <TaskWorkload />}
      <TaskCreateDialog />
      <TaskDrawer onClose={closeTask} />
    </div>
  );
}
