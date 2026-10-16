"use client";

import { useCallback, useState } from "react";
import { Loader2, UserCog } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import type { LeadCard } from "@/hooks/use-leads-board";
import { assignLead, fetchAssignable, type AssignableStaff } from "./ownership-api";
import { ownerInitials, ownerName } from "./ownership-format";

/** More than this many people: a search box appears (searchable select rule). */
const SEARCH_FROM = 7;

/** «Boshqaga berish» (ADR-0092): the lead branch's staff who may claim leads. */
export function LeadOwnerAssign({
  leadId,
  currentOwnerId,
  disabled,
  onAssigned,
}: {
  leadId: string;
  currentOwnerId: number | null;
  disabled?: boolean;
  onAssigned: (card: LeadCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<AssignableStaff[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    setStaff(null);
    try {
      setStaff(await fetchAssignable(leadId));
    } catch {
      setFailed(true);
    }
  }, [leadId]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      void load();
    }
  };

  const pick = async (person: AssignableStaff) => {
    setSaving(person.id);
    try {
      onAssigned(await assignLead(leadId, person.id));
      toast.success(`Lid ${ownerName(person)}ga berildi`);
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lidni berib bo'lmadi"));
    } finally {
      setSaving(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = (staff ?? []).filter(
    (p) => p.id !== currentOwnerId && ownerName(p).toLowerCase().includes(needle),
  );

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <UserCog className="size-4" />
          Boshqaga berish
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {staff && staff.length > SEARCH_FROM && (
          <Input
            placeholder="Xodim qidirish..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8"
          />
        )}
        <div className="max-h-60 overflow-y-auto overscroll-contain">
          {failed ? (
            <div className="space-y-2 px-2 py-3 text-sm text-muted-foreground">
              <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Qayta urinish
              </Button>
            </div>
          ) : staff === null ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Lid beriladigan xodim topilmadi
            </p>
          ) : (
            shown.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={saving !== null}
                onClick={() => void pick(p)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
              >
                <Avatar className="size-6">
                  <AvatarImage src={p.photo ?? undefined} />
                  <AvatarFallback className="text-[10px]">{ownerInitials(p)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{ownerName(p)}</span>
                {saving === p.id && <Loader2 className="ml-auto size-4 animate-spin" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
