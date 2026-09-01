"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** O'ng chekkada ko'rsatiladigan son — masalan shu darajadagi guruhlar soni. */
  count?: number;
  /** Odam tanlanadigan ro'yxatlar uchun (o'qituvchi, xodim). */
  avatarUrl?: string | null;
  initials?: string;
  /** Yorliq o'rniga chiziladigan belgi — masalan rangli daraja nishoni. */
  leading?: ReactNode;
  /**
   * Ro'yxatda ustiga sarlavha qo'yiladigan guruh nomi. Guruhlar tanlov
   * MA'NOSINI o'zgartirganda kerak bo'ladi — masalan lidlarda bitta guruh
   * ichidagi tanlovlar YOKI bilan, guruhlar orasidagilari VA bilan
   * birlashadi; sarlavhasiz buni ro'yxatdan o'qib bo'lmaydi.
   */
  group?: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Hech narsa tanlanmaganda ko'rinadigan matn — «Barcha ...» shaklida. */
  placeholder: string;
  searchPlaceholder?: string;
  /** `count` yonida turadigan so'z: «guruh», «o'quvchi». */
  countSuffix?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = "Qidirish...",
  countSuffix,
  className,
  contentClassName,
  disabled,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectedLabel = (() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? placeholder;
    }
    return `${selected.length} ta tanlangan`;
  })();

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          type="button"
          disabled={disabled}
          className={cn(
            "h-9 justify-between font-normal",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <div className="flex items-center gap-1 shrink-0">
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Tozalash"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange([]);
                  }
                }}
                className="inline-flex size-4 items-center justify-center rounded hover:bg-muted"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[260px] p-0 gap-0", contentClassName)}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 border-b">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8"
          />
        </div>
        {/*
          «Hammasi» alohida variant emas, tanlovni tozalash. Uni ro'yxatdagi
          belgilanadigan qatorga aylantirish "hammasi + A1" degan ma'nosiz
          holatni ochib qo'yadi — bo'sh tanlov allaqachon "hammasi" degani.
        */}
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-sm hover:bg-muted",
            selected.length === 0 && "bg-muted/60",
          )}
        >
          <span className="flex size-4 items-center justify-center rounded border border-input">
            {selected.length === 0 && <Check className="size-3" />}
          </span>
          <span className="truncate">{placeholder}</span>
        </button>
        <div className="max-h-[260px] overflow-y-auto overscroll-contain py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Topilmadi
            </div>
          ) : (
            filtered.map((option, index) => {
              const groupChanged =
                option.group !== undefined &&
                option.group !== filtered[index - 1]?.group;
              const isSelected = selected.includes(option.value);
              return (
                <div key={option.value}>
                  {groupChanged && (
                    <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      {option.group}
                    </div>
                  )}
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted",
                    isSelected && "bg-muted/60",
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded border border-input">
                    {isSelected && <Check className="size-3" />}
                  </span>
                  {option.initials !== undefined && (
                    <Avatar size="sm">
                      {option.avatarUrl && (
                        <AvatarImage
                          src={option.avatarUrl}
                          alt={option.label}
                        />
                      )}
                      <AvatarFallback>{option.initials}</AvatarFallback>
                    </Avatar>
                  )}
                  {option.leading ?? (
                    <span className="flex-1 truncate">{option.label}</span>
                  )}
                  {option.leading && <span className="flex-1" />}
                  {option.count !== undefined && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {option.count}
                      {countSuffix ? ` ${countSuffix}` : ""}
                    </span>
                  )}
                </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
