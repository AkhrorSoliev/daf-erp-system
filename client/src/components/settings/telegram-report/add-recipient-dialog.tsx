"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Candidate } from "./telegram-report-api";

interface Props {
  candidates: Candidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (userId: number) => void;
  pending: boolean;
}

/** The pick resets by remounting the body whenever the dialog opens. */
export function AddRecipientDialog({ candidates, open, onOpenChange, onAdd, pending }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Oluvchi qo&apos;shish</DialogTitle>
        </DialogHeader>
        {open && <Body candidates={candidates} onAdd={onAdd} pending={pending} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ candidates, onAdd, pending, onCancel }: Omit<Props, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [pick, setPick] = useState("");
  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Qo&apos;shiladigan xodim yo&apos;q</p>;
  }
  return (
    <>
      <Select value={pick} onValueChange={setPick}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Xodimni tanlang" /></SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.position ? ` — ${c.position}` : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onCancel}>Bekor qilish</Button>
        <Button disabled={!pick || pending} onClick={() => onAdd(Number(pick))}>
          {pending && <Loader2 className="size-4 animate-spin" />} Qo&apos;shish
        </Button>
      </DialogFooter>
    </>
  );
}
