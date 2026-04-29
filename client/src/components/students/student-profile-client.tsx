"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditStudentDrawer } from "./edit-student-drawer";
import { StudentProfileCard } from "./student-profile-card";
import { StudentProfileTabs } from "./student-profile-tabs";
import { EnrollToGroupDialog } from "./enroll-to-group-dialog";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";
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
  const [refundOpen, setRefundOpen] = useState(false);
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full lg:w-85 lg:shrink-0">
          <div className="space-y-4 rounded-lg border bg-card p-6">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-3 border-t pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-1" />
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
            onRefundClick={() => setRefundOpen(true)}
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
      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        studentId={student.id}
        studentName={`${student.firstName} ${student.lastName}`}
        onSuccess={() => fetchStudent(false)}
      />
    </>
  );
}
