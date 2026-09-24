import { SettingsMenu } from "@/components/settings/settings-menu";

export default function SettingsPage() {
  return (
    <>
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">Sozlamalar</h1>
        <p className="text-sm text-muted-foreground">Tizim sozlamalari va boshqaruv</p>
      </div>
      <SettingsMenu />
    </>
  );
}
