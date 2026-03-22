"use client";

import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Student } from "@/data/student-model";

function formatDate(iso: string): string {
  return format(new Date(iso), "dd.MM.yyyy");
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-md border">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface StudentProfileTabsProps {
  student: Student;
}

export function StudentProfileTabs({ student }: StudentProfileTabsProps) {
  return (
    <Tabs defaultValue="guruhlar" className="w-full">
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
        {student.status === "ungrouped" && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            Talaba faol guruhga qo&apos;shilmagan!
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
                    colSpan={5}
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
        {student.userComments.length === 0 ? (
          <EmptyState message="Izohlar mavjud emas" />
        ) : (
          <ul className="space-y-3">
            {student.userComments.map((comment) => (
              <li key={comment.id} className="rounded-md border p-3 text-sm">
                <p>{comment.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {comment.createdBy} · {formatDate(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* Qo'ng'iroq tarixi */}
      <TabsContent value="qongiroq">
        <EmptyState message="Qo'ng'iroq tarixi mavjud emas" />
      </TabsContent>

      {/* SMS */}
      <TabsContent value="sms">
        {student.smsHistory.length === 0 ? (
          <EmptyState message="SMS tarixi mavjud emas" />
        ) : (
          <ul className="space-y-3">
            {student.smsHistory.map((sms) => (
              <li key={sms.id} className="rounded-md border p-3 text-sm">
                <p>{sms.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(sms.sentAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* Tarix */}
      <TabsContent value="tarix">
        {!student.createdBy ? (
          <EmptyState message="Tarix mavjud emas" />
        ) : (
          <div className="rounded-md border p-4 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Qo&apos;shilgan:</span>{" "}
              {student.createdBy.by}
            </p>
            <p>
              <span className="text-muted-foreground">Sana:</span>{" "}
              {formatDate(student.createdBy.at)}
            </p>
          </div>
        )}
      </TabsContent>

      {/* Lid tarixi */}
      <TabsContent value="lid">
        <EmptyState message="Lid tarixi mavjud emas" />
      </TabsContent>
    </Tabs>
  );
}
