"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

interface GroupStudent {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
}

interface GroupStudentsHoverCardProps {
  groupId: number;
  /** Trigger element (the group name link). */
  children: ReactNode;
}

/**
 * Guruh nomiga hover qilinganda ichidagi o'quvchilar ro'yxatini ko'rsatadi.
 * Yengil ishlash uchun ro'yxat faqat hover ochilganda bir marta yuklanadi
 * (`GET /groups/:id/students`), keyin keshlanadi. Qidiruv + avatarli ro'yxat,
 * har bir o'quvchi profil sahifasiga link.
 */
export function GroupStudentsHoverCard({
  groupId,
  children,
}: GroupStudentsHoverCardProps) {
  const [students, setStudents] = useState<GroupStudent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const fetchedRef = useRef(false);

  const fetchStudents = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const { data } = await api.get(`/groups/${groupId}/students`);
      setStudents(data);
    } catch {
      setStudents([]);
      fetchedRef.current = false; // keyingi hoverda qayta urinish uchun
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) fetchStudents();
    },
    [fetchStudents],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = students ?? [];
    if (!q) return list;
    return list.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.lastName} ${s.firstName}`
        .toLowerCase()
        .includes(q),
    );
  }, [students, search]);

  return (
    <HoverCard openDelay={150} closeDelay={150} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-0">
        {/* Qidiruv */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="O'quvchini qidirish..."
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        {/* Ro'yxat — ~5 ta ko'rinadi, qolgani scroll */}
        <div className="max-h-48 overflow-y-auto overscroll-contain p-1">
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {search ? "O'quvchi topilmadi" : "O'quvchilar yo'q"}
            </p>
          ) : (
            filtered.map((s) => {
              const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();
              return (
                <Link
                  key={s.id}
                  href={`/students/profile/${s.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage src={s.photo ?? undefined} alt={s.firstName} />
                    <AvatarFallback className="text-[10px]">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">
                    {s.firstName} {s.lastName}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
