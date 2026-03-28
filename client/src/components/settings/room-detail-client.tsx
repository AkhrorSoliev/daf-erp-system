"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  DoorOpen,
  Loader2,
  Pencil,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { useEditRoom } from "@/hooks/use-edit-room";
import { EditRoomDrawer } from "./edit-room-drawer";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";
import api from "@/lib/api";

interface RoomGroup {
  id: string;
  name: string;
  course: { name: string };
  teacher: { id: number; name: string };
  isActive: boolean;
}

interface RoomDetail {
  id: string;
  name: string;
  capacity: number | null;
  branchId: number;
  branch: { name: string };
  groups: RoomGroup[];
}

export function RoomDetailClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const openDrawer = useEditRoom((s) => s.openDrawer);
  const setName = useBreadcrumbName((s) => s.setName);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data);
        setName(roomId, data.name);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchRoom();
  }, [roomId, setName]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Xona topilmadi
        </h1>
        <p className="text-muted-foreground">
          ID: {roomId} bo&apos;yicha xona mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push("/settings/rooms")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Orqaga</TooltipContent>
        </Tooltip>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {room.name}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {room.branch.name}
            {room.capacity && ` • ${room.capacity} o'rin`}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openDrawer({
                  id: room.id,
                  name: room.name,
                  capacity: room.capacity,
                  branchId: room.branchId,
                  branchName: room.branch.name,
                })
              }
            >
              <Pencil className="mr-1.5 h-4 w-4" />
              Tahrirlash
            </Button>
          </TooltipTrigger>
          <TooltipContent>Xonani tahrirlash</TooltipContent>
        </Tooltip>
      </div>

      {/* Biriktirilgan guruhlar */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Biriktirilgan guruhlar</h3>
          <Badge variant="outline" className="ml-auto">
            {room.groups.length} ta guruh
          </Badge>
        </div>

        {room.groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm">Bu xonaga hali guruh biriktirilmagan</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>Guruh nomi</TableHead>
                  <TableHead>Kurs</TableHead>
                  <TableHead>O&apos;qituvchi</TableHead>
                  <TableHead>Holati</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {room.groups.map((group, index) => (
                  <TableRow key={group.id}>
                    <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.course.name}</TableCell>
                    <TableCell>{group.teacher.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={group.isActive ? "default" : "secondary"}
                      >
                        {group.isActive ? "Faol" : "Nofaol"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dars jadvali placeholder */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Dars jadvali</h3>
        </div>
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <DoorOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm">Hozircha darslar mavjud emas</p>
        </div>
      </div>

      <EditRoomDrawer
        onSaved={(updated) =>
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  name: updated.name,
                  capacity: updated.capacity,
                }
              : prev,
          )
        }
      />
    </div>
  );
}
