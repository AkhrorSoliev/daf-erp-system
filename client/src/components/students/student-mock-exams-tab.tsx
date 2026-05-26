"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  ClipboardCheck,
  Loader2,
  Trophy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import toast from "react-hot-toast";

type MockExamStatus =
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "GRADING"
  | "ANNOUNCED"
  | "ARCHIVED";

interface MockExamRecord {
  id: string;
  publicId: number;
  registeredAt: string;
  paid: boolean;
  paidAt: string | null;
  totalScore: number | null;
  percentage: number | null;
  rank: number | null;
  passed: boolean | null;
  exam: {
    id: string;
    title: string;
    status: MockExamStatus;
    examDate: string | null;
    maxScore: number;
    price: number;
    section: { name: string; color: string | null };
  };
}

const STATUS_LABELS: Record<MockExamStatus, string> = {
  REGISTRATION_OPEN: "Ro'yxat ochiq",
  REGISTRATION_CLOSED: "Ro'yxat yopiq",
  GRADING: "Baholanmoqda",
  ANNOUNCED: "E'lon qilingan",
  ARCHIVED: "Arxivlangan",
};

const STATUS_COLORS: Record<MockExamStatus, string> = {
  REGISTRATION_OPEN:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  REGISTRATION_CLOSED:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  GRADING: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  ANNOUNCED:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  ARCHIVED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StudentMockExamsTab({ studentId }: { studentId: number }) {
  const [records, setRecords] = useState<MockExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    api
      .get<MockExamRecord[]>(`/students/${studentId}/mock-exams`)
      .then(({ data }) => setRecords(data))
      .catch((error) => {
        toast.error(
          getErrorMessage(
            error,
            "Mock imtihonlar tarixini yuklashda xatolik",
          ),
        );
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <ClipboardCheck className="size-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          Bu o&apos;quvchi hali biror mock imtihonda qatnashmagan
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="w-32">Sana</TableHead>
              <TableHead>Imtihon</TableHead>
              <TableHead className="w-28">Holat</TableHead>
              <TableHead className="w-28">To&apos;lov</TableHead>
              <TableHead className="w-28 text-right">Natija</TableHead>
              <TableHead className="w-20 text-center">O&apos;rin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {r.exam.examDate ? (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3 text-muted-foreground" />
                      {format(parseISO(r.exam.examDate), "dd.MM.yyyy")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/mock-exams/${r.exam.id}`}
                    className="hover:underline"
                  >
                    <div className="text-sm font-medium">{r.exam.title}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px]">
                      <span
                        className="rounded-full px-1.5 py-0.5"
                        style={{
                          backgroundColor: `${r.exam.section.color ?? "#94a3b8"}20`,
                          color: r.exam.section.color ?? "#475569",
                        }}
                      >
                        {r.exam.section.name}
                      </span>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      STATUS_COLORS[r.exam.status]
                    }`}
                  >
                    {STATUS_LABELS[r.exam.status]}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {r.paid ? (
                    <span className="text-emerald-600">
                      ✓ To&apos;langan
                    </span>
                  ) : r.exam.price > 0 ? (
                    <span className="text-amber-600">Kutilmoqda</span>
                  ) : (
                    <span className="text-muted-foreground">Bepul</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {r.totalScore !== null ? (
                    <>
                      <span className="font-medium">{r.totalScore}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        / {r.exam.maxScore}
                      </span>
                      {r.percentage !== null && (
                        <div className="text-[10px] text-muted-foreground">
                          {Math.round(r.percentage)}%
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {r.rank !== null ? (
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {r.rank}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Trophy className="mr-1 inline size-3" />
        Mock imtihonlar — o&apos;quvchini real imtihonga tayyorlash uchun.
        ID raqami #{records[0]?.publicId} bo&apos;yicha PDF natijalarda
        ko&apos;rinadi.
      </div>
    </div>
  );
}
