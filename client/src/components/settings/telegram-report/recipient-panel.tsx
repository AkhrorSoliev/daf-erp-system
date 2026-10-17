"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Loader2, Send, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getErrorMessage } from "@/lib/get-error-message";
import { previewRecipient, type BranchOption, type Recipient, type RecipientPatch } from "./telegram-report-api";
import { LAYOUTS, SECTIONS, SEND_TIMES, type ReportSection } from "./telegram-report-labels";
import { reachMeta } from "./recipient-view";
import { ReachPill } from "./recipient-table";

interface Props {
  recipient: Recipient;
  branches: BranchOption[];
  now: Date;
  /** A patch or a removal is in flight (until the refetch lands): the controls wait. */
  busy: boolean;
  testing: boolean;
  checking: boolean;
  onPatch: (patch: RecipientPatch) => void;
  onTest: () => void;
  onCheck: () => void;
  onRemove: () => void;
}

/** Mount with `key={recipient.id}` so the preview never outlives its recipient. */
export function RecipientPanel({ recipient: r, branches, now, busy, testing, checking, onPatch, onTest, onCheck, onRemove }: Props) {
  // undefined = not loaded, null = the server had no branch to print.
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  // Bumped on every patch: a preview that started before the last patch is stale.
  const patchSeq = useRef(0);
  const meta = reachMeta(r, now);

  // A saved change makes the loaded sample stale.
  const patch = (p: RecipientPatch) => { patchSeq.current += 1; setPreview(undefined); onPatch(p); };
  const toggleBranch = (id: number, on: boolean) =>
    patch({ branchIds: on ? [...r.branchIds, id] : r.branchIds.filter((b) => b !== id) });
  const toggleSection = (s: ReportSection, on: boolean) => {
    const next = on ? [...r.sections, s] : r.sections.filter((x) => x !== s);
    if (next.length) patch({ sections: next });
  };
  const loadPreview = async () => {
    const seq = patchSeq.current;
    setPreviewing(true);
    try {
      const { text } = await previewRecipient(r.id);
      if (seq === patchSeq.current) setPreview(text);
    } catch (e) {
      toast.error(getErrorMessage(e, "Namunani yuklab bo'lmadi"));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border p-4 lg:sticky lg:top-4">
      <div className="space-y-1">
        <p className="font-medium">{r.name}</p>
        {r.position && <p className="text-xs text-muted-foreground">{r.position}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <ReachPill meta={meta} />
          <span className="text-xs text-muted-foreground">{meta.note}</span>
        </div>
        {r.noBranch && <p className="text-xs text-destructive">Filial tanlanmagan — hisobot bormaydi.</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Vaqt</Label>
        <Select value={r.sendTime} disabled={busy} onValueChange={(v) => patch({ sendTime: v })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{SEND_TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Ko&apos;rinish</Label>
        <Select value={r.layout} disabled={busy} onValueChange={(v) => patch({ layout: v as Recipient["layout"] })}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LAYOUTS.map((l) => (
              <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{LAYOUTS.find((l) => l.value === r.layout)?.hint}</p>
      </div>

      <div className="space-y-2">
        <Label>Filiallar</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={r.allBranches} disabled={busy} onCheckedChange={(v) => patch({ allBranches: v === true })} />
          Barcha filiallar <span className="text-xs text-muted-foreground">(keyin ochilganlar ham)</span>
        </label>
        {!r.allBranches && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={r.branchIds.includes(b.id)} disabled={busy} onCheckedChange={(v) => toggleBranch(b.id, v === true)} />
                {b.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Bo&apos;limlar</Label>
        <div className="grid gap-2">
          {SECTIONS.map((s) => (
            <label key={s.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={r.sections.includes(s.value)}
                disabled={busy || (r.sections.length === 1 && r.sections.includes(s.value))}
                onCheckedChange={(v) => toggleSection(s.value, v === true)}
              />
              {s.label}
              {s.money && <span className="text-xs text-muted-foreground">· pul</span>}
            </label>
          ))}
        </div>
      </div>

      {preview !== undefined && (
        <div className="space-y-1.5">
          {preview === null ? (
            <p className="text-xs text-muted-foreground">Filial tanlanmagan — namuna yo&apos;q</p>
          ) : (
            <>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{preview}</pre>
              <p className="text-xs text-muted-foreground">Namuna hozirgi raqamlar bilan</p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={previewing || busy} onClick={() => void loadPreview()}>
          {previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          Namunani ko&apos;rish
        </Button>
        <Button variant="outline" size="sm" disabled={testing || r.reach === "UNLINKED" || r.reach === "BLOCKED"} onClick={onTest}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Hozir yuborish
        </Button>
        <Button variant="outline" size="sm" disabled={checking} onClick={onCheck}>
          {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Ulanishni tekshirish
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy}>
              <Trash2 className="size-4" /> Olib tashlash
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{r.name} ro&apos;yxatdan olib tashlansinmi?</AlertDialogTitle>
              <AlertDialogDescription>Unga hisobot boshqa bormaydi. Keyin qayta qo&apos;shish mumkin.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemove}>
                Olib tashlash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
