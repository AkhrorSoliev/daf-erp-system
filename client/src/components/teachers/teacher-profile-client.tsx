"use client";

import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { TeacherProfileCard } from "./teacher-profile-card";
import { TeacherProfileTabs } from "./teacher-profile-tabs";
import type { Teacher } from "@/data/teacher-model";

export function TeacherProfileClient({ teacher }: { teacher: Teacher }) {
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
