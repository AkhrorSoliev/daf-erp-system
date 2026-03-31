"use client";

import { useRef, useState, useCallback } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { AlertTriangle, CalendarIcon, ClockIcon, UsersIcon } from "lucide-react";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { CommentList, type CommentData } from "@/components/shared/comment-list";
import { CommentForm } from "@/components/shared/comment-form";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Student, StudentGroup } from "@/data/student-model";

const STATUS_MAP: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  1: { label: "Faol", variant: "default" },
  2: { label: "Boshlanmagan", variant: "secondary" },
  3: { label: "Pauza", variant: "outline" },
  4: { label: "To'xtatilgan", variant: "destructive" },
};

const DAYS_MAP: Record<string, string> = {
  odd: "Toq kunlar",
  even: "Juft kunlar",
};

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Du",
  tuesday: "Se",
  wednesday: "Cho",
  thursday: "Pa",
  friday: "Ju",
  saturday: "Sha",
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function GroupCard({ group }: { group: StudentGroup }) {
  const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];

  const daysLabel = group.days
    ? DAYS_MAP[group.days]
    : group.exactDays.length > 0
      ? group.exactDays.map((d) => WEEKDAY_SHORT[d] ?? d).join(", ")
      : null;

  const timeLabel =
    group.lessonStartTime && group.lessonEndTime
      ? `${group.lessonStartTime} – ${group.lessonEndTime}`
      : null;

  return (
    <Link href={`/groups/${group.id}`}>
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
        {/* Row 1: Name + Status */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="font-semibold">{group.name}</h4>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Row 2: Course + Teacher */}
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {group.course_name ?? "—"}
            {group.level && ` • ${group.level}`}
          </span>
          {group.teachers.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UsersIcon className="size-3.5" />
              {group.teachers.map((t) => t.name).join(", ")}
            </span>
          )}
        </div>

        {/* Row 3: Schedule + Dates */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {(daysLabel || timeLabel) && (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {[daysLabel, timeLabel].filter(Boolean).join(" • ")}
            </span>
          )}
          {group.startDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              {format(new Date(group.startDate), "dd.MM.yyyy")}
              {group.endDate && ` – ${format(new Date(group.endDate), "dd.MM.yyyy")}`}
            </span>
          )}
        </div>

        {/* Row 4: Enrolled date */}
        <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
          Qo&apos;shilgan: {format(new Date(group.enrolledAt), "dd.MM.yyyy")}
        </div>
      </div>
    </Link>
  );
}

interface StudentProfileTabsProps {
  student: Student;
  onCommentChange?: () => void;
}

export function StudentProfileTabs({ student, onCommentChange }: StudentProfileTabsProps) {
  const isUngrouped = student.isActive && student.groups.length === 0;
  const [historyVisible, setHistoryVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<CommentData[]>([]);
  const historyShown = useRef(false);
  const commentsShown = useRef(false);

  const handleOptimisticAdd = useCallback((comment: CommentData) => {
    setOptimisticComments((prev) => [comment, ...prev]);
  }, []);

  const handleConfirmed = useCallback((tempId: string, _real: CommentData) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
    onCommentChange?.();
  }, [onCommentChange]);

  const handleFailed = useCallback((tempId: string) => {
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? { ...c, _pending: false, _failed: true } : c)),
    );
  }, []);

  const handleTabChange = (value: string) => {
    if (value === "tarix" && !historyShown.current) {
      historyShown.current = true;
      setHistoryVisible(true);
    }
    if (value === "izohlar" && !commentsShown.current) {
      commentsShown.current = true;
      setCommentsVisible(true);
    }
  };

  return (
    <Tabs defaultValue="guruhlar" className="w-full" onValueChange={handleTabChange}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="guruhlar">Guruhlar</TabsTrigger>
        <TabsTrigger value="izohlar">Izohlar</TabsTrigger>
        <TabsTrigger value="qongiroq">Qo&apos;ng&apos;iroq tarixi</TabsTrigger>
        <TabsTrigger value="sms">SMS</TabsTrigger>
        <TabsTrigger value="tarix">Tarix</TabsTrigger>
        <TabsTrigger value="lid">Lid tarixi</TabsTrigger>
      </TabsList>

      {/* Guruhlar */}
      <TabsContent value="guruhlar">
        {isUngrouped && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            Talaba faol guruhga qo&apos;shilmagan!
          </div>
        )}

        {student.groups.length > 0 ? (
          <div className="mb-6 grid gap-3">
            {student.groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        ) : (
          <div className="mb-6">
            <EmptyState message="Guruhlar mavjud emas" />
          </div>
        )}

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold">Oylik balans xolati</h3>
          <EmptyState message="Ko'rsatiladigan ma'lumotlar yo'q" />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">To&apos;lovlar</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Miqdor</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead>Xodim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    Ma&apos;lumotlar yo&apos;q
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </TabsContent>

      {/* Izohlar */}
      <TabsContent value="izohlar">
        {commentsVisible ? (
          <div className="space-y-4">
            <CommentForm
              entityType="Student"
              entityId={student.id}
              onOptimisticAdd={handleOptimisticAdd}
              onConfirmed={handleConfirmed}
              onFailed={handleFailed}
            />
            <CommentList
              entityType="Student"
              entityId={student.id}
              optimisticComments={optimisticComments}
              onCommentChange={onCommentChange}
            />
          </div>
        ) : (
          <EmptyState message="Izohlar mavjud emas" />
        )}
      </TabsContent>

      {/* Qo'ng'iroq tarixi */}
      <TabsContent value="qongiroq">
        <EmptyState message="Qo'ng'iroq tarixi mavjud emas" />
      </TabsContent>

      {/* SMS */}
      <TabsContent value="sms">
        <EmptyState message="SMS tarixi mavjud emas" />
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {historyVisible ? (
          <EntityHistoryTable entityType="Student" entityId={student.id} />
        ) : (
          <EmptyState message="Tarix mavjud emas" />
        )}
      </TabsContent>

      {/* Lid tarixi */}
      <TabsContent value="lid">
        <EmptyState message="Lid tarixi mavjud emas" />
      </TabsContent>
    </Tabs>
  );
}
