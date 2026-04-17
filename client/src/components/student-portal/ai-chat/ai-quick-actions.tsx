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
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onAction(text)}
          disabled={disabled}
          className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:scale-[0.97] disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
