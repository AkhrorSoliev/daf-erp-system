"use client";

import { useEffect } from "react";
import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { TeacherProfileCard } from "./teacher-profile-card";
import { TeacherProfileTabs } from "./teacher-profile-tabs";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { Teacher } from "@/data/teacher-model";

export function TeacherProfileClient({ teacher }: { teacher: Teacher }) {
  const setName = useBreadcrumbName((s) => s.setName);

  useEffect(() => {
    setName(teacher.id, `${teacher.firstName} ${teacher.lastName}`);
  }, [teacher.id, teacher.firstName, teacher.lastName, setName]);

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <TeacherProfileCard teacher={teacher} />
        </div>
        <div className="min-w-0 flex-1">
          <TeacherProfileTabs teacher={teacher} />
        </div>
      </div>
      <EditTeacherDrawer />
    </>
  );
}
