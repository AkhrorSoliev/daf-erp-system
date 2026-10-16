"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { BranchOption, Recipient, RecipientPatch } from "./telegram-report-api";
import { LAYOUTS, SECTIONS, SEND_TIMES, type ReportSection } from "./telegram-report-labels";

interface Props {
  recipient: Recipient;
  branches: BranchOption[];
  busy: boolean;
  testing: boolean;
  onPatch: (patch: RecipientPatch) => void;
  onTest: () => void;
  onRemove: () => void;
}

export function RecipientCard({ recipient: r, branches, busy, testing, onPatch, onTest, onRemove }: Props) {
  const toggleBranch = (id: number, on: boolean) =>
    onPatch({ branchIds: on ? [...r.branchIds, id] : r.branchIds.filter((b) => b !== id) });
  const toggleSection = (s: ReportSection, on: boolean) => {
    const next = on ? [...r.sections, s] : r.sections.filter((x) => x !== s);
    if (next.length) onPatch({ sections: next });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{r.name}</p>
          {r.position && <p className="text-xs text-muted-foreground">{r.position}</p>}
        </div>
        <div className="flex items-center gap-2">
          {r.telegramLinked ? (
            <Badge variant="secondary">✅ Telegram ulangan</Badge>
          ) : (
            <Badge variant="destructive">⚠️ Telegram ulanmagan</Badge>
          )}
          <Switch checked={r.isActive} disabled={busy} onCheckedChange={(v) => onPatch({ isActive: v })} aria-label="Yoqilgan" />
        </div>
      </div>
      {!r.telegramLinked && (
        <p className="text-xs text-muted-foreground">Hisobot bormaydi — xodim botda /xodim orqali ulanishi kerak.</p>
      )}
      {r.noBranch && <p className="text-xs text-destructive">Filial tanlanmagan — hisobot bormaydi.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Vaqt</Label>
          <Select value={r.sendTime} disabled={busy} onValueChange={(v) => onPatch({ sendTime: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{SEND_TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ko&apos;rinish</Label>
          <Select value={r.layout} disabled={busy} onValueChange={(v) => onPatch({ layout: v as Recipient["layout"] })}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LAYOUTS.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{LAYOUTS.find((l) => l.value === r.layout)?.hint}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Filiallar</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={r.allBranches} disabled={busy} onCheckedChange={(v) => onPatch({ allBranches: v === true })} />
          Barcha filiallar <span className="text-xs text-muted-foreground">(keyin ochilganlar ham)</span>
        </label>
        {!r.allBranches && (
          <div className="flex flex-wrap gap-4 pl-6">
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
        <div className="grid gap-2 sm:grid-cols-2">
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={testing || !r.telegramLinked} onClick={onTest}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Hozir sinab ko&apos;rish
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
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onRemove}>
                Olib tashlash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
