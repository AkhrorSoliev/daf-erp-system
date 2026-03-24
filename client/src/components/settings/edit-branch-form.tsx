"use client";

import { useForm, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import type { Branch } from "@/hooks/use-edit-branch";

interface EditBranchFormProps {
  branch: Branch | null;
  onClose: () => void;
  formId: string;
}

export function EditBranchForm({ branch, onClose, formId }: EditBranchFormProps) {
  const form = useForm({
    defaultValues: {
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      status: branch?.status ?? ("active" as const),
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
          Filial ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Filial nomi</Label>
          <Input
            id="name"
            placeholder="Filial nomi"
            {...form.register("name")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Manzil</Label>
          <Input
            id="address"
            placeholder="Manzil"
            {...form.register("address")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput value={field.value} onChange={field.onChange} />
              )}
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
