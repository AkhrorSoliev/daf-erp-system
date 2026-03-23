"use client";

import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Employee } from "@/hooks/use-edit-employee";

interface EditEmployeeFormProps {
  employee: Employee;
  onClose: () => void;
  formId: string;
}

export function EditEmployeeForm({ employee, onClose, formId }: EditEmployeeFormProps) {
  const form = useForm({
    defaultValues: {
      fullName: employee.fullName,
      role: employee.role,
      phone: employee.phone,
      branch: employee.branch,
      status: employee.status,
    },
  });

  const onSubmit = () => {
    onClose();
  };

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Xodim ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Ism familiya</Label>
          <Input
            id="fullName"
            placeholder="Ism familiya"
            {...form.register("fullName")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Lavozimi</Label>
            <Select
              value={form.watch("role")}
              onValueChange={(value) => form.setValue("role", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Direktor">Direktor</SelectItem>
                <SelectItem value="Kassir">Kassir</SelectItem>
                <SelectItem value="Administrator">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              placeholder="+998 90 123 45 67"
              {...form.register("phone")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="branch">Filial</Label>
            <Input
              id="branch"
              placeholder="Asosiy filial"
              {...form.register("branch")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Holati</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(value: "active" | "inactive") =>
                form.setValue("status", value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="inactive">Nofaol</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </form>
  );
}
