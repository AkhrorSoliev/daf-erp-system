import Link from "next/link";
import { ChevronRight, SearchX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { splitByQuery } from "@/lib/settings-search";
import type { SettingsNavItem, SettingsNavSection } from "@/lib/settings-nav";

/** Nomning so'rovga mos qismi ajratib ko'rsatiladi (qidiruv natijasi "tirik" sezilsin). */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitByQuery(text, query).map((part, i) =>
        part.match ? (
          <span key={i} className="rounded-sm bg-warning/25">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function SettingsRow({ item, query }: { item: SettingsNavItem; query: string }) {
  return (
    <Link
      href={item.url}
      className="group flex items-center gap-3.5 border-b border-r px-4 py-3.5 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <item.icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          <Highlighted text={item.title} query={query} />
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
          {item.description}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/40 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}

/**
 * Bitta mavzu: sarlavha, bir qatorli izoh va punktlar. Katta ekranda ikki
 * ustun; qatorlarning o'ng/pastki chizig'i ichkariga o'tib ketmasligi uchun
 * panel `overflow-hidden`, tarmoq esa 1px kattaroq (-mr-px -mb-px).
 */
export function SettingsSection({
  section,
  query,
}: {
  section: SettingsNavSection;
  query: string;
}) {
  return (
    <section aria-label={section.title}>
      <div className="mb-3 flex items-center gap-3 px-1">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <section.icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight tracking-tight">{section.title}</h2>
          <p className="text-xs text-muted-foreground">{section.summary}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {section.items.length} ta
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="-mb-px -mr-px grid sm:grid-cols-2">
          {section.items.map((item) => (
            <SettingsRow key={item.url} item={item} query={query} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Foydalanuvchi hali o'qilmagan paytda ro'yxatning o'z shakli: sakrash bo'lmaydi. */
export function SettingsMenuSkeleton() {
  return (
    <div className="space-y-7" aria-busy="true">
      {[4, 3, 5].map((rows, s) => (
        <div key={s}>
          <Skeleton className="mb-3 h-4 w-40" />
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="-mb-px -mr-px grid sm:grid-cols-2">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3.5 border-b border-r px-4 py-3.5">
                  <Skeleton className="size-10 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <SearchX className="mb-3 size-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium">{`«${query}» bo'yicha sozlama topilmadi`}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        {"Boshqa so'z bilan urinib ko'ring, masalan: bayram, telefon, filial, pauza."}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        Qidiruvni tozalash
      </button>
    </div>
  );
}
