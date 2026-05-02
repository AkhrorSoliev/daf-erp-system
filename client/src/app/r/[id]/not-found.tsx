import { AlertCircle } from "lucide-react";

export default function ReceiptNotFound() {
  return (
    <div className="rounded-lg border bg-background shadow-sm p-6 text-center space-y-3">
      <div className="flex justify-center">
        <AlertCircle className="size-10 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold">Hujjat topilmadi</h1>
      <p className="text-sm text-muted-foreground">
        Tekshirilayotgan kvitansiya identifikatori noto&apos;g&apos;ri yoki
        hujjat o&apos;chirib tashlangan bo&apos;lishi mumkin.
      </p>
    </div>
  );
}
