"use client";

import { useEffect } from "react";
import { EditStudentDrawer } from "./edit-student-drawer";
import { StudentProfileCard } from "./student-profile-card";
import { StudentProfileTabs } from "./student-profile-tabs";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { Student } from "@/data/student-model";

export function StudentProfileClient({ student }: { student: Student }) {
  const setName = useBreadcrumbName((s) => s.setName);

  useEffect(() => {
    setName(student.id, `${student.firstName} ${student.lastName}`);
  }, [student.id, student.firstName, student.lastName, setName]);

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <StudentProfileCard student={student} />
        </div>
        <div className="min-w-0 flex-1">
          <StudentProfileTabs student={student} />
        </div>
      </div>
      <EditStudentDrawer />
    </>
  );
}
