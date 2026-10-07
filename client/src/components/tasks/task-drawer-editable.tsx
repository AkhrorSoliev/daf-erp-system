"use client";
import { useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Text that its owner edits where it stands: click, type, leave the field (or
 * Enter; Ctrl+Enter in a long text) to save, Escape to drop the change. The
 * field is uncontrolled, so a save is one `onSave` with what was typed.
 */
export function EditableText({ value, canEdit, multiline = false, placeholder, maxLength, className, onSave }: {
  value: string; canEdit: boolean; multiline?: boolean; placeholder: string; maxLength: number; className?: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!canEdit) return value ? <span className={cn("block whitespace-pre-wrap break-words", className)}>{value}</span> : null;
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className={cn("block w-full whitespace-pre-wrap break-words rounded text-left hover:bg-muted/60", className)}>
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }
  const finish = (el: Field) => {
    setEditing(false);
    const next = el.value.trim();
    // A title cannot be emptied; a description can.
    if (next !== value && (multiline || next)) onSave(next);
  };
  const onKeyDown = (e: KeyboardEvent<Field>) => {
    if (e.key === "Escape") { e.currentTarget.value = value; e.currentTarget.blur(); }
    else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur(); }
  };
  return multiline ? (
    <Textarea autoFocus defaultValue={value} maxLength={maxLength} placeholder={placeholder} rows={3} className={className} onBlur={(e) => finish(e.currentTarget)} onKeyDown={onKeyDown} />
  ) : (
    <Input autoFocus defaultValue={value} maxLength={maxLength} placeholder={placeholder} className={cn("h-9", className)} onBlur={(e) => finish(e.currentTarget)} onKeyDown={onKeyDown} />
  );
}
