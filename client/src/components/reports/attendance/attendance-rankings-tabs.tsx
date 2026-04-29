"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceTeachersTable } from "./attendance-teachers-table";
import { AttendanceGroupsTable } from "./attendance-groups-table";
import { AttendanceCoursesTable } from "./attendance-courses-table";
import type {
  AttendanceCoursesResponse,
  AttendanceGroupsResponse,
  AttendanceTeachersResponse,
  GroupSortBy,
  SortOrder,
  TeacherSortBy,
} from "./metric-helpers";

export type AttendanceTab = "teachers" | "groups" | "courses";

interface Props {
  activeTab: AttendanceTab;
  onTabChange: (tab: AttendanceTab) => void;

  teachersData: AttendanceTeachersResponse | undefined;
  teachersLoading: boolean;
  teachersPage: number;
  teachersPageSize: number;
  teachersSortBy: TeacherSortBy;
  teachersSortOrder: SortOrder;
  onTeachersPageChange: (page: number) => void;
  onTeachersPageSizeChange: (size: number) => void;
  onTeachersSortChange: (sortBy: TeacherSortBy, order: SortOrder) => void;

  groupsData: AttendanceGroupsResponse | undefined;
  groupsLoading: boolean;
  groupsPage: number;
  groupsPageSize: number;
  groupsSortBy: GroupSortBy;
  groupsSortOrder: SortOrder;
  onGroupsPageChange: (page: number) => void;
  onGroupsPageSizeChange: (size: number) => void;
  onGroupsSortChange: (sortBy: GroupSortBy, order: SortOrder) => void;

  coursesData: AttendanceCoursesResponse | undefined;
  coursesLoading: boolean;
}

export function AttendanceRankingsTabs({
  activeTab,
  onTabChange,
  teachersData,
  teachersLoading,
  teachersPage,
  teachersPageSize,
  teachersSortBy,
  teachersSortOrder,
  onTeachersPageChange,
  onTeachersPageSizeChange,
  onTeachersSortChange,
  groupsData,
  groupsLoading,
  groupsPage,
  groupsPageSize,
  groupsSortBy,
  groupsSortOrder,
  onGroupsPageChange,
  onGroupsPageSizeChange,
  onGroupsSortChange,
  coursesData,
  coursesLoading,
}: Props) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as AttendanceTab)}
    >
      <TabsList>
        <TabsTrigger value="teachers">
          O&apos;qituvchilar
          {teachersData && (
            <span className="ml-1.5 text-muted-foreground tabular-nums text-xs">
              ({teachersData.total})
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="groups">
          Guruhlar
          {groupsData && (
            <span className="ml-1.5 text-muted-foreground tabular-nums text-xs">
              ({groupsData.total})
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="courses">
          Kurslar
          {coursesData && (
            <span className="ml-1.5 text-muted-foreground tabular-nums text-xs">
              ({coursesData.courses.length})
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="teachers" className="mt-3">
        <AttendanceTeachersTable
          teachers={teachersData?.teachers ?? []}
          total={teachersData?.total ?? 0}
          page={teachersPage}
          pageSize={teachersPageSize}
          sortBy={teachersSortBy}
          sortOrder={teachersSortOrder}
          isLoading={teachersLoading}
          onPageChange={onTeachersPageChange}
          onPageSizeChange={onTeachersPageSizeChange}
          onSortChange={onTeachersSortChange}
        />
      </TabsContent>

      <TabsContent value="groups" className="mt-3">
        <AttendanceGroupsTable
          groups={groupsData?.groups ?? []}
          total={groupsData?.total ?? 0}
          page={groupsPage}
          pageSize={groupsPageSize}
          sortBy={groupsSortBy}
          sortOrder={groupsSortOrder}
          isLoading={groupsLoading}
          onPageChange={onGroupsPageChange}
          onPageSizeChange={onGroupsPageSizeChange}
          onSortChange={onGroupsSortChange}
        />
      </TabsContent>

      <TabsContent value="courses" className="mt-3">
        <AttendanceCoursesTable
          courses={coursesData?.courses ?? []}
          isLoading={coursesLoading}
        />
      </TabsContent>
    </Tabs>
  );
}
