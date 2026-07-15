"use client";

interface AiQuickActionsProps {
  suggestions: string[];
  onAction: (message: string) => void;
  disabled?: boolean;
}

export function AiQuickActions({
  suggestions,
  onAction,
  disabled,
}: AiQuickActionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1">
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onAction(text)}
          disabled={disabled}
          className="shrink-0 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink-700 transition-colors hover:bg-tint active:scale-95 disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
