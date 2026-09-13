"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { LeadSourceOption } from "@/hooks/use-leads-board";
import { LEAD_SOURCE_NAME_MAX, normalizeSourceName } from "./lead-source-name";

interface LeadSourcePickerProps {
  /** Ochiq bo'lgan oyna/panelning holati — har ochilganda ro'yxat qayta yuklanadi. */
  open: boolean;
  value: string;
  onChange: (sourceId: string) => void;
  label: string;
  /** Yulduzcha qo'yadi. Majburiyligini formaning sxemasi hal qiladi, bu faqat belgi. */
  required?: boolean;
  /** Formadan kelgan xato matni. */
  error?: string;
  id?: string;
  /** Ro'yxat yuklanmasa ko'rsatiladigan matn. */
  loadErrorMessage?: string;
}

/**
 * Manba tanlagich — tanlash VA o'sha joyning o'zida yangi manba qo'shish.
 *
 * Uchta joyda ishlatiladi: o'quvchi qo'shish, lid qo'shish, lid tahrirlash.
 * Ilgari qo'shish imkoniyati faqat lid qo'shish panelida bor edi, qolgan
 * joylarda admin yangi manba uchun butunlay boshqa sahifaga borishi kerak
 * edi. Ro'yxat bitta va umumiy, shuning uchun bu yerda qo'shilgan manba
 * darhol hamma joyda ko'rinadi.
 */
export function LeadSourcePicker({
  open,
  value,
  onChange,
  label,
  required = false,
  error,
  id = "sourceId",
  loadErrorMessage = "Manbalar ro'yxati yuklanmadi",
}: LeadSourcePickerProps) {
  const [sources, setSources] = useState<LeadSourceOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAdding(false);
    setNewName("");
    api
      .get<LeadSourceOption[]>("/lead-sources")
      .then(({ data }) => {
        if (!cancelled) setSources(data);
      })
      .catch(() => {
        if (cancelled) return;
        setSources([]);
        toast.error(loadErrorMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadErrorMessage]);

  async function handleCreate() {
    const name = normalizeSourceName(newName);
    if (!name) {
      toast.error(
        `Manba nomini kiriting (eng ko'pi ${LEAD_SOURCE_NAME_MAX} belgi)`,
      );
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<LeadSourceOption>("/lead-sources", {
        name,
      });
      setSources((prev) => [...prev, data]);
      // Yangi manba darhol tanlangan bo'ladi — admin uni qaytadan izlamasin.
      onChange(data.id);
      setAdding(false);
      setNewName("");
      toast.success("Manba qo'shildi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Manba qo'shishda xatolik"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>

      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Manbani tanlang" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {adding ? (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Panel ichidagi bu maydon tashqi formani yubormasin.
              e.preventDefault();
              void handleCreate();
            }}
            placeholder="Yangi manba nomi"
            maxLength={LEAD_SOURCE_NAME_MAX}
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={saving}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Qo&apos;shish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            disabled={saving}
          >
            Bekor
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-primary hover:underline"
        >
          + Yangi manba qo&apos;shish
        </button>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
