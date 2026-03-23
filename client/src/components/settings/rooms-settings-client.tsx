"use client";

import { useState } from "react";
import { Plus, DoorOpen } from "lucide-react";
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
import { RoomRowActions } from "./room-row-actions";
import { EditRoomDrawer } from "./edit-room-drawer";
import type { Room } from "@/hooks/use-edit-room";

const mockRooms: Room[] = [
  { id: "1", name: "101-xona", capacity: 20, branch: "Asosiy filial", status: "active" },
  { id: "2", name: "102-xona", capacity: 15, branch: "Asosiy filial", status: "active" },
  { id: "3", name: "103-xona", capacity: 25, branch: "Asosiy filial", status: "inactive" },
  { id: "4", name: "201-xona", capacity: 18, branch: "2-filial", status: "active" },
  { id: "5", name: "202-xona", capacity: 22, branch: "2-filial", status: "active" },
];

export function RoomsSettingsClient() {
  const [search, setSearch] = useState("");

  const filtered = mockRooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Xonalar"
        description="Dars xonalarini boshqarish va yangi xonalar qo'shish"
      />

      <div className="flex items-center gap-3">
        <Input
          placeholder="Xona nomi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Yangi xona
            </Button>
          </TooltipTrigger>
          <TooltipContent>Yangi xona qo&apos;shish</TooltipContent>
        </Tooltip>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Xona nomi</TableHead>
              <TableHead>Sig&apos;imi</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Holati</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <DoorOpen className="h-8 w-8 text-muted-foreground/50" />
                    Xonalar topilmadi
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.capacity} o&apos;rin</TableCell>
                  <TableCell>{room.branch}</TableCell>
                  <TableCell>
                    <Badge variant={room.status === "active" ? "default" : "secondary"}>
                      {room.status === "active" ? "Faol" : "Nofaol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RoomRowActions room={room} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditRoomDrawer />
    </div>
  );
}
