"use client";

import { Clock, Hash, Phone, Type, X } from "lucide-react";
import type { FlatItem } from "./search-dropdown-utils";

interface EmptyStateProps {
  recentSearches: string[];
  activeIndex: number;
  flatItems: FlatItem[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}

export function EmptyState({
  recentSearches,
  activeIndex,
  flatItems,
  onSelect,
  onRemove,
  onClear,
}: EmptyStateProps) {
  return (
    <div className="py-2">
      {/* Search hints */}
      <div className="px-3 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Qidirish bo&#39;yicha maslahatlar
        </p>
        <div className="space-y-1.5">
          <HintRow
            icon={Type}
            text="Ism yoki familiya yozing"
            example="Ali Valiyev"
          />
          <HintRow
            icon={Phone}
            text="Telefon raqam bilan qidiring"
            example="901234567"
          />
          <HintRow icon={Hash} text="ID bilan qidiring" example="#10234" />
        </div>
      </div>

      {/* Recent searches */}
      {recentSearches.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between px-3 mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              So&#39;nggi qidiruvlar
            </p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={onClear}
            >
              Tozalash
            </button>
          </div>
          {recentSearches.map((term) => {
            const idx = flatItems.findIndex(
              (f) => f.type === "recent" && f.id === term,
            );
            return (
              <div
                key={term}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm group ${
                  idx === activeIndex ? "bg-accent" : "hover:bg-accent"
                }`}
              >
                <Clock className="size-3.5 text-muted-foreground shrink-0" />
                <button
                  className="flex-1 text-left truncate cursor-pointer"
                  onClick={() => onSelect(term)}
                >
                  {term}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted cursor-pointer transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(term);
                  }}
                >
                  <X className="size-3 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HintRow({
  icon: Icon,
  text,
  example,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  example: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span>{text}</span>
      <code className="ml-auto bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
        {example}
      </code>
    </div>
  );
}
