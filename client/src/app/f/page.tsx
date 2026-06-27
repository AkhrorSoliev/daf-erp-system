import { Link2 } from "lucide-react";

// Landing page for `form.dafzentrum.uz/` (root) — explains that public
// forms are accessed only via a unique link the admin shares.
export default function FormIndexPage() {
  return (
    <div className="rounded-[26px] border border-border bg-card p-8 text-center shadow-[0_18px_40px_-12px_rgba(14,42,61,0.18)]">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <Link2 className="size-8 text-primary" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-foreground">
        Bevosita kirish mumkin emas
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        Bu sahifa faqat sizga yuborilgan maxsus havola orqali ochiladi. Iltimos,
        formaga kirish uchun siz qabul qilgan havolani bosing.
      </p>
      <p className="mt-7 text-[11px] font-bold tracking-[0.18em] text-muted-foreground/70 uppercase">
        DaF Sprachzentrum
      </p>
    </div>
  );
}
