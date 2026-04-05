"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Building2, Loader2 } from "lucide-react";
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
import api from "@/lib/api";

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  }
  return `+998 ${phone}`;
}

export function BranchesSettingsClient() {

  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const openAddDrawer = useEditBranch((s) => s.openAddDrawer);

  useEffect(() => {
    async function fetchBranches() {
      try {
        const companyId = localStorage.getItem("companyId");
        const params = companyId ? { company_id: companyId } : {};
        const { data } = await api.get("/branches", { params });
        setBranches(
          data.map((b: any) => ({
            id: String(b.id),
            name: b.name,
            address: b.address ?? "",
            phone: b.phone ?? "",
            status: b.isActive ? "active" : "inactive",
            startOfWorkingDay: b.startOfWorkingDay ?? "",
            endOfWorkingDay: b.endOfWorkingDay ?? "",
          })),
        );
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchBranches();
  }, []);

  const filtered = branches.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.address.toLowerCase().includes(search.toLowerCase()),
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
          className="w-full sm:max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Filial nomi</TableHead>
              <TableHead>Manzil</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/50" />
                    Filiallar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((branch, index) => (
                <TableRow
                  key={branch.id}
                  className="relative cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/settings/branches/${branch.id}`} className="absolute inset-0" />
                    {branch.name}
                  </TableCell>
                  <TableCell>{branch.address}</TableCell>
                  <TableCell>
                    {branch.phone ? formatPhone(branch.phone) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        branch.status === "active" ? "default" : "secondary"
                      }
                    >
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

      <EditBranchDrawer
        onSaved={(saved) => {
          setBranches((prev) => {
            const idx = prev.findIndex((b) => b.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }}
      />
    </div>
  );
}
