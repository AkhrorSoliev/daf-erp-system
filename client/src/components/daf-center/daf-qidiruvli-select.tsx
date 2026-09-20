"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface QidiruvliVariant {
  value: string;
  label: string;
}

/** Qidiruv maydoni faqat ro'yxat uzun bo'lganda — to'rtta variantga u ortiqcha. */
const QIDIRUV_CHEGARASI = 7;

/**
 * Uzun bo'lishi mumkin bo'lgan ro'yxat uchun bitta tanlovli qidiruvli tanlagich
 * (`client/CLAUDE.md` «Searchable Select»: guruh va o'qituvchi aynan shunday
 * ro'yxatlar). `modal` va `overscroll-contain` — touchpad bilan aylantirish
 * ishlashi uchun, TimePicker va guruh o'qituvchisi tanlagichidagi bilan bir xil sabab.
 */
export function DafQidiruvliSelect({
  value,
  onChange,
  variantlar,
  hammasiMatni,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  variantlar: QidiruvliVariant[];
  hammasiMatni: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const tanlangan = useMemo(
    () => variantlar.find((v) => v.value === value) ?? null,
    [variantlar, value],
  );
  const korinadigan = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? variantlar.filter((v) => v.label.toLowerCase().includes(q)) : variantlar;
  }, [variantlar, search]);

  const tanla = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 justify-between font-normal", className)}
        >
          <span className={cn("truncate", !tanlangan && "text-muted-foreground")}>
            {tanlangan?.label ?? hammasiMatni}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {variantlar.length > QIDIRUV_CHEGARASI && (
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-4 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidirish..."
              maxLength={100}
              className="h-8 pl-8"
            />
          </div>
        )}
        <div className="max-h-60 overflow-y-auto overscroll-contain p-1">
          <button
            type="button"
            onClick={() => tanla(null)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <Check className={cn("size-4 shrink-0", value !== null && "invisible")} />
            {hammasiMatni}
          </button>
          {korinadigan.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => tanla(v.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Check className={cn("size-4 shrink-0", value !== v.value && "invisible")} />
              <span className="truncate">{v.label}</span>
            </button>
          ))}
          {korinadigan.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">Topilmadi</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
