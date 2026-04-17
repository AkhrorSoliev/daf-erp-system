"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EditStudentDrawer } from "./edit-student-drawer";
import { StudentProfileCard } from "./student-profile-card";
import { StudentProfileTabs } from "./student-profile-tabs";
import { EnrollToGroupDialog } from "./enroll-to-group-dialog";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import type { Student } from "@/data/student-model";
import api from "@/lib/api";

export function StudentProfileClient({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [commentKey, setCommentKey] = useState(0);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [groupsRefreshing, setGroupsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("guruhlar");
  const setName = useBreadcrumbName((s) => s.setName);

  const handleCommentChange = useCallback(() => {
    setCommentKey((k) => k + 1);
  }, []);

  const fetchStudent = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await api.get(`/students/${studentId}`);
      setStudent(data);
      setError(false);
    } catch {
      if (showLoader) setError(true);
    } finally {
      if (showLoader) setLoading(false);
      setGroupsRefreshing(false);
    }
  }, [studentId]);

  const refreshStudent = useCallback(() => {
    fetchStudent(false);
  }, [fetchStudent]);

  const handleEnrolled = useCallback(() => {
    setGroupsRefreshing(true);
    fetchStudent(false);
  }, [fetchStudent]);

  useEffect(() => {
    fetchStudent();
  }, [fetchStudent]);

  useEffect(() => {
    if (student) {
      setName(String(student.id), `${student.firstName} ${student.lastName}`);
    }
  }, [student, setName]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          O&apos;quvchi topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {studentId} bo&apos;yicha o&apos;quvchi mavjud emas
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <StudentProfileCard
            student={student}
            commentKey={commentKey}
            onEnrollClick={() => setEnrollOpen(true)}
            onHistoryClick={() => setActiveTab("tarix")}
            onPaymentClick={() => setPaymentOpen(true)}
            onPaymentHistoryClick={() => setActiveTab("tolovlar")}
          />
        </div>
        <div className="min-w-0 flex-1">
          <StudentProfileTabs
            student={student}
            onCommentChange={handleCommentChange}
            onEnrollmentChange={refreshStudent}
            groupsRefreshing={groupsRefreshing}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
      <EditStudentDrawer
        onSaved={(updated) => setStudent(updated)}
      />
      <EnrollToGroupDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        studentId={student.id}
        studentName={`${student.firstName} ${student.lastName}`}
        enrolledGroupIds={student.groups.map((g) => g.id)}
        onEnrolled={handleEnrolled}
      />
      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        preSelectedStudent={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          balance: student.balance,
        }}
        onSuccess={() => fetchStudent(false)}
      />
    </>
  );
}
