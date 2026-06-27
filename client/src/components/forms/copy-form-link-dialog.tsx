"use client";

import { useEffect, useState } from "react";
import { ClipboardCopy, Link2, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";
import { buildPublicFormLink, buildTaggedFormLink } from "@/lib/public-form-link";

interface LeadSourceLite {
  id: string;
  name: string;
}

// Always offered, even before any exist in the DB — they get persisted the
// moment the first lead arrives through the tagged link.
const DEFAULT_SOURCES = ["Telegram", "Instagram"];

async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Nusxalashda xatolik");
  }
}

interface Props {
  slug: string;
  label?: string;
  className?: string;
}

/**
 * "Havolani nusxalash" — copies the form's public link with a chosen source
 * tag (`?source=<name>`) so leads arriving through it are attributed to that
 * channel/ad. Offers Telegram + Instagram by default, lists previously-used
 * sources, and lets the user add a custom name.
 */
export function CopyFormLinkButton({ slug, label = "Havolani nusxalash", className }: Props) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<LeadSourceLite[]>("/lead-sources")
      .then(({ data }) => setSources(mergeSources(data.map((s) => s.name))))
      .catch(() => setSources(DEFAULT_SOURCES));
  }, [open]);

  async function copyWithSource(name: string) {
    await copyText(
      buildTaggedFormLink(slug, name),
      `Havola nusxalandi — manba: ${name}`,
    );
  }

  async function addAndCopy() {
    const name = custom.trim();
    if (!name) return;
    setAdding(true);
    try {
      // Persist so it's remembered next time. Ignore failures (e.g. it already
      // exists) — the link still works via submit-time find-or-create.
      await api.post("/lead-sources", { name }).catch(() => {});
      setSources((prev) => mergeSources([...prev.slice(DEFAULT_SOURCES.length), name]));
      await copyWithSource(name);
      setCustom("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={className}>
          <ClipboardCopy className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Havolani nusxalash</DialogTitle>
          <DialogDescription>
            Manbani tanlang — lid qaysi havoladan kelganini bilib turasiz
            (Instagram, Telegram yoki reklama nomi).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-60 space-y-1.5 overflow-y-auto overscroll-contain">
            {sources.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => copyWithSource(name)}
                className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="truncate font-medium">{name}</span>
                <ClipboardCopy className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addAndCopy();
                }
              }}
              placeholder="Boshqa manba (masalan: reklama_may)"
              maxLength={100}
              disabled={adding}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addAndCopy}
              disabled={adding || !custom.trim()}
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Qo&apos;shish
            </Button>
          </div>

          <button
            type="button"
            onClick={() =>
              copyText(buildPublicFormLink(slug), "Havola nusxalandi (manbasiz)")
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Link2 className="size-3.5" />
            Manbasiz havolani nusxalash
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Defaults first, then unique custom/DB names (case-insensitive dedupe).
function mergeSources(names: string[]): string[] {
  const seen = new Set(DEFAULT_SOURCES.map((s) => s.toLowerCase()));
  const out = [...DEFAULT_SOURCES];
  for (const n of names) {
    const trimmed = n.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}
