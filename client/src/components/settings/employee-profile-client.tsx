"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EmployeeProfileCard } from "./employee-profile-card";
import { EmployeeProfileTabs } from "./employee-profile-tabs";
import { EditEmployeeDrawer } from "./edit-employee-drawer";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { EmployeeUser } from "@/hooks/use-edit-employee";
import api from "@/lib/api";

export function EmployeeProfileClient({ employeeId }: { employeeId: string }) {
  const setName = useBreadcrumbName((s) => s.setName);
  const [employee, setEmployee] = useState<EmployeeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users/${employeeId}`);
      setEmployee(data);
      setName(employeeId, data.name);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId, setName]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const [commentKey, setCommentKey] = useState(0);
  const handleCommentChange = useCallback(() => {
    setCommentKey((k) => k + 1);
  }, []);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Xodim topilmadi</h1>
        <p className="text-muted-foreground">
          ID: {employeeId} bo&apos;yicha xodim mavjud emas
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <EmployeeProfileCard employee={employee} commentKey={commentKey} />
        </div>
        <div className="min-w-0 flex-1">
          <EmployeeProfileTabs employee={employee} onCommentChange={handleCommentChange} />
        </div>
      </div>
      <EditEmployeeDrawer onSaved={(updated) => {
        setEmployee(updated);
        setName(employeeId, updated.name);
      }} />
    </>
  );
}
