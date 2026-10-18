"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";

/** The «no channel» choice: a Radix select cannot hold an empty value. */
export const NO_SOURCE = "none";

interface SourceOption {
  id: string;
  name: string;
}

/**
 * «Kanal» of a MARKETING expense (ADR-0109): which lead source the money paid for, so the
 * marketing report can show what one student of that channel cost. «Umumiy» = not one channel.
 * `current` is the row's own source, kept in the list even if it was archived since.
 */
export function ExpenseSourceField({
  value,
  onChange,
  current,
}: {
  value: string;
  onChange: (sourceId: string) => void;
  current?: SourceOption | null;
}) {
  const [sources, setSources] = useState<SourceOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SourceOption[]>("/lead-sources")
      .then(({ data }) => {
        if (!cancelled) setSources(data);
      })
      // The field still works with «Umumiy»; the dialog's own save reports real errors.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const options = current && !sources.some((s) => s.id === current.id) ? [...sources, current] : sources;

  return (
    <div className="space-y-2">
      <Label>Kanal</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SOURCE}>Umumiy (bitta kanal emas)</SelectItem>
          {options.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Reklama qaysi kanal uchun bo&apos;lsa, shuni tanlang — hisobotda shu kanalning o&apos;quvchisi narxi chiqadi.</p>
    </div>
  );
}
