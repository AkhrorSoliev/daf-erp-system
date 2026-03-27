"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditRoom, type Room } from "@/hooks/use-edit-room";
import api from "@/lib/api";

interface RoomRowActionsProps {
  room: Room;
  onDeleted?: (id: string) => void;
}

export function RoomRowActions({ room, onDeleted }: RoomRowActionsProps) {
  const { openDrawer } = useEditRoom();

  const handleDelete = async () => {
    try {
      await api.delete(`/rooms/${room.id}`);
      toast.success("Xona muvaffaqiyatli o'chirildi");
      onDeleted?.(room.id);
    } catch {
      toast.error("Xonani o'chirishda xatolik yuz berdi");
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Amallar</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Amallar</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openDrawer(room)}>
          <Pencil className="mr-2 size-4" />
          Tahrirlash
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
          <Trash2 className="mr-2 size-4" />
          O&apos;chirish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
