import { FileX2 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="rounded-[26px] border border-border bg-card p-8 text-center shadow-[0_18px_40px_-12px_rgba(14,42,61,0.18)]">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
        <FileX2 className="size-8 text-muted-foreground" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-foreground">Forma topilmadi</h1>
      <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
        Bu havola eskirgan yoki forma o&apos;chirilgan bo&apos;lishi mumkin.
      </p>
    </div>
  );
}
