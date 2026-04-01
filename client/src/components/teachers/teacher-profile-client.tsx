"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EditTeacherDrawer } from "./edit-teacher-drawer";
import { TeacherProfileCard } from "./teacher-profile-card";
import { TeacherProfileTabs } from "./teacher-profile-tabs";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { TeacherData } from "@/hooks/use-edit-teacher";
import api from "@/lib/api";

export function TeacherProfileClient({ teacherId }: { teacherId: string }) {
  const setName = useBreadcrumbName((s) => s.setName);
  const [teacher, setTeacher] = useState<TeacherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTeacher = useCallback(async () => {
    try {
      const { data } = await api.get(`/teachers/${teacherId}`);
      setTeacher(data);
      setName(teacherId, `${data.firstName} ${data.lastName}`);
    } catch {
      setError("O'qituvchi topilmadi");
    } finally {
      setLoading(false);
    }
  }, [teacherId, setName]);

  useEffect(() => {
    fetchTeacher();
  }, [fetchTeacher]);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">O&apos;qituvchi topilmadi</h1>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

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
      <EditTeacherDrawer
        onSaved={(updated) => {
          setTeacher(updated);
          setName(teacherId, `${updated.firstName} ${updated.lastName}`);
        }}
      />
    </>
  );
}
