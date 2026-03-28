"use client";

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPageHeader } from "./settings-page-header";

interface LeftStudent {
  id: string;
  fullName: string;
  group: string;
  leftDate: string;
  reason: string;
}

const mockLeftStudents: LeftStudent[] = [
  { id: "1", fullName: "Aliyev Jasur", group: "Deutsch A1 - 12-guruh", leftDate: "10.02.2026", reason: "Shaxsiy sabab" },
  { id: "2", fullName: "Karimova Nilufar", group: "Deutsch A2 - 5-guruh", leftDate: "15.02.2026", reason: "Boshqa shaharga ko'chish" },
  { id: "3", fullName: "Toshmatov Bekzod", group: "Deutsch B1 - 3-guruh", leftDate: "01.03.2026", reason: "Moliyaviy sabab" },
  { id: "4", fullName: "Rahimova Madina", group: "Deutsch A1 - 14-guruh", leftDate: "18.03.2026", reason: "Vaqt yetishmasligi" },
];

export function LeftStudentsSettingsClient() {
  const [search, setSearch] = useState("");

  const filtered = mockLeftStudents.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Guruhni tark etgan o'quvchilar"
        description="Guruhlardan chiqib ketgan o'quvchilar ro'yxati va sabablari"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Ism yoki guruh bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Ism familiya</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Ketgan sana</TableHead>
              <TableHead>Sabab</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <UserMinus className="h-8 w-8 text-muted-foreground/50" />
                    O&apos;quvchilar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((student, index) => (
                <TableRow key={student.id}>
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{student.fullName}</TableCell>
                  <TableCell>{student.group}</TableCell>
                  <TableCell>{student.leftDate}</TableCell>
                  <TableCell className="text-muted-foreground">{student.reason}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
