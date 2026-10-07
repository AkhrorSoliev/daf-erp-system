"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssignable, type AssignableUser } from "./use-assignable";
import { ROLE_LABEL, ROLE_ORDER } from "./task-labels";

// A search box on a short list is noise (client/CLAUDE.md, «Searchable Select»).
const SEARCH_FROM = 8;

// A person with several roles is listed once, under their highest.
const topRole = (u: AssignableUser) => ROLE_ORDER.find((r) => u.roleNames.includes(r));

function Face({ u, size, text }: { u: AssignableUser; size: string; text: string }) {
  return (
    <Avatar className={size}>
      {u.photo && <AvatarImage src={u.photo} />}
      <AvatarFallback className={text}>{u.firstName[0]}{u.lastName[0]}</AvatarFallback>
    </Avatar>
  );
}

export function TaskAssigneePicker({ value, onChange, mode, placeholder }: {
  value: number[]; onChange: (ids: number[]) => void; mode: "assignees" | "watchers"; placeholder: string;
}) {
  const { data, isLoading, isError } = useAssignable();
  const [q, setQ] = useState("");
  const all = data?.[mode] ?? [];
  const needle = q.trim().toLowerCase();
  const users = all.filter((u) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(needle));
  const selected = all.filter((u) => value.includes(u.id));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const groups = ROLE_ORDER.map((role) => ({ role, items: users.filter((u) => topRole(u) === role) })).filter((g) => g.items.length);
  return (
    // modal + overscroll-contain: touchpad scroll inside a Radix popover (same as TimePicker).
    <Popover modal onOpenChange={(open) => { if (!open) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-left text-sm">
          {selected.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs">
              <Face u={u} size="size-5" text="text-[8px]" />
              {u.firstName} {u.lastName}
              <X aria-label="Olib tashlash" className="size-3" onClick={(e) => { e.stopPropagation(); toggle(u.id); }} />
            </span>
          ))}
          {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-2">
        {all.length >= SEARCH_FROM && <Input autoFocus placeholder="Ism yozing" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />}
        <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain">
          {isLoading && (
            <div className="space-y-1 p-1">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.role}>
              <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">{ROLE_LABEL[g.role]}</p>
              {g.items.map((u) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${value.includes(u.id) ? "bg-primary/10" : ""}`}>
                  <Face u={u} size="size-6" text="text-[9px]" />
                  <span className="flex-1 truncate">{u.firstName} {u.lastName}</span>
                  {!u.telegramLinked && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Telegram ulanmagan</span>}
                  <span className="text-[11px] text-muted-foreground">{u.branchNames[0] ?? ""}</span>
                </button>
              ))}
            </div>
          ))}
          {isError && <p className="p-2 text-xs text-muted-foreground">Ro&apos;yxatni yuklab bo&apos;lmadi</p>}
          {!isLoading && !isError && groups.length === 0 && <p className="p-2 text-xs text-muted-foreground">Hech kim topilmadi</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
