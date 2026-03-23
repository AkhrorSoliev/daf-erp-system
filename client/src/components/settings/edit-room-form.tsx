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
import type { Room } from "@/hooks/use-edit-room";

interface EditRoomFormProps {
  room: Room;
  onClose: () => void;
  formId: string;
}

export function EditRoomForm({ room, onClose, formId }: EditRoomFormProps) {
  const form = useForm({
    defaultValues: {
      name: room.name,
      capacity: room.capacity,
      branch: room.branch,
      status: room.status,
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
          Xona ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Xona nomi</Label>
          <Input
            id="name"
            placeholder="101-xona"
            {...form.register("name")}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="capacity">Sig&apos;imi</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              placeholder="20"
              {...form.register("capacity", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch">Filial</Label>
            <Input
              id="branch"
              placeholder="Asosiy filial"
              {...form.register("branch")}
            />
          </div>
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
      </section>
    </form>
  );
}
