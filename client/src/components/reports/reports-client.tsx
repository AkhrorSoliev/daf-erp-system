"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { format, startOfMonth } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { ReportsKpis } from "./reports-kpis";
import { ReportsRoomUtilization } from "./reports-room-utilization";
import { ReportsTeacherPerformance } from "./reports-teacher-performance";
import { ReportsAttendanceAnalytics } from "./reports-attendance-analytics";
import { ReportsGroupAnalytics } from "./reports-group-analytics";
import { ReportsLeadAnalytics } from "./reports-lead-analytics";

const VALID_TABS = ["kpis", "rooms", "teachers", "attendance", "groups", "leads"];
const DEFAULT_TAB = "kpis";

export function ReportsClient() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const tabFromUrl = searchParams.get("tab") ?? DEFAULT_TAB;
  const initialTab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : DEFAULT_TAB;

  // Lazy tab loading flags
  const loaded = useRef<Record<string, boolean>>({ [initialTab]: true });
  const [activeTab, setActiveTabState] = useState(initialTab);

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTabState(value);
      loaded.current[value] = true;
      const params = new URLSearchParams(searchParams.toString());
      if (value === DEFAULT_TAB) {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const branchId = selectedBranch?.id ?? 0;
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <DatePicker
          value={startDate}
          onChange={(d) => d && setStartDate(d)}
          className="w-auto"
        />
        <span className="text-muted-foreground text-sm">—</span>
        <DatePicker
          value={endDate}
          onChange={(d) => d && setEndDate(d)}
          className="w-auto"
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger value="kpis">Umumiy</TabsTrigger>
            <TabsTrigger value="rooms">Xonalar</TabsTrigger>
            <TabsTrigger value="teachers">O&apos;qituvchilar</TabsTrigger>
            <TabsTrigger value="attendance">Davomat</TabsTrigger>
            <TabsTrigger value="groups">Guruhlar</TabsTrigger>
            <TabsTrigger value="leads">Lidlar</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="kpis">
          <ReportsKpis
            branchId={branchId}
            startDate={startStr}
            endDate={endStr}
          />
        </TabsContent>

        <TabsContent value="rooms">
          {loaded.current.rooms && (
            <ReportsRoomUtilization
              branchId={branchId}
              startDate={startStr}
              endDate={endStr}
            />
          )}
        </TabsContent>

        <TabsContent value="teachers">
          {loaded.current.teachers && (
            <ReportsTeacherPerformance
              branchId={branchId}
              startDate={startStr}
              endDate={endStr}
            />
          )}
        </TabsContent>

        <TabsContent value="attendance">
          {loaded.current.attendance && (
            <ReportsAttendanceAnalytics
              branchId={branchId}
              startDate={startStr}
              endDate={endStr}
            />
          )}
        </TabsContent>

        <TabsContent value="groups">
          {loaded.current.groups && (
            <ReportsGroupAnalytics
              branchId={branchId}
              startDate={startStr}
              endDate={endStr}
            />
          )}
        </TabsContent>

        <TabsContent value="leads">
          {loaded.current.leads && (
            <ReportsLeadAnalytics startDate={startStr} endDate={endStr} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
