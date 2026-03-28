"use client";

import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { SettingsPageHeader } from "./settings-page-header";
import { EmployeeRowActions } from "./employee-row-actions";
import { EditEmployeeDrawer } from "./edit-employee-drawer";
import { useEditEmployee } from "@/hooks/use-edit-employee";
import type { Employee } from "@/hooks/use-edit-employee";

const mockEmployees: Employee[] = [
  { id: "1", fullName: "Karimov Sardor", role: "Admin", phone: "+998 90 123 45 67", branch: "Asosiy filial", status: "active" },
  { id: "2", fullName: "Rahimova Dilnoza", role: "Direktor", phone: "+998 91 234 56 78", branch: "2-filial", status: "active" },
  { id: "3", fullName: "Toshmatov Firdavs", role: "Kassir", phone: "+998 93 345 67 89", branch: "Asosiy filial", status: "active" },
  { id: "4", fullName: "Aliyeva Sevara", role: "Administrator", phone: "+998 94 456 78 90", branch: "Asosiy filial", status: "inactive" },
];

const roleColors: Record<string, "default" | "secondary" | "outline"> = {
  Admin: "default",
  Direktor: "secondary",
  Kassir: "outline",
  Administrator: "outline",
};

export function EmployeesSettingsClient() {
  const [search, setSearch] = useState("");
  const openAddDrawer = useEditEmployee((s) => s.openAddDrawer);

  const filtered = mockEmployees.filter(
    (e) =>
      e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Xodimlar"
        description="Tizim xodimlarini boshqarish va rollarni belgilash"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={openAddDrawer}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi xodim
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi xodim qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Ism yoki lavozim bo'yicha qidirish..."
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
              <TableHead>Lavozimi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                    Xodimlar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((employee, index) => (
                <TableRow key={employee.id}>
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{employee.fullName}</TableCell>
                  <TableCell>
                    <Badge variant={roleColors[employee.role] || "outline"}>
                      {employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{employee.phone}</TableCell>
                  <TableCell>{employee.branch}</TableCell>
                  <TableCell>
                    <Badge variant={employee.status === "active" ? "default" : "secondary"}>
                      {employee.status === "active" ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <EmployeeRowActions employee={employee} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditEmployeeDrawer />
    </div>
  );
}
