"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
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
import { BranchRowActions } from "./branch-row-actions";
import { EditBranchDrawer } from "./edit-branch-drawer";
import { useEditBranch } from "@/hooks/use-edit-branch";
import type { Branch } from "@/hooks/use-edit-branch";

const mockBranches: Branch[] = [
  { id: "1", name: "Asosiy filial", address: "Toshkent sh., Chilonzor t., 1-kvartal", phone: "901234567", status: "active" },
  { id: "2", name: "2-filial", address: "Toshkent sh., Yunusobod t., 5-kvartal", phone: "912345678", status: "active" },
  { id: "3", name: "3-filial", address: "Toshkent sh., Mirzo Ulug'bek t., 3-kvartal", phone: "933456789", status: "inactive" },
];

export function BranchesSettingsClient() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const openAddDrawer = useEditBranch((s) => s.openAddDrawer);

  const filtered = mockBranches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Filiallar"
        description="Filiallarni boshqarish va yangi filiallar qo'shish"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={openAddDrawer}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi filial
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi filial qo&apos;shish</TooltipContent>
          </Tooltip>
        }
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Filial nomi yoki manzil bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filial nomi</TableHead>
              <TableHead>Manzil</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/50" />
                    Filiallar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((branch) => (
                <TableRow
                  key={branch.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/settings/branches/${branch.id}`)}
                >
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell>{branch.address}</TableCell>
                  <TableCell>+998 {branch.phone.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4")}</TableCell>
                  <TableCell>
                    <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                      {branch.status === "active" ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BranchRowActions branch={branch} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditBranchDrawer />
    </div>
  );
}
