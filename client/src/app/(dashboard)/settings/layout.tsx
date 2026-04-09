import { SettingsLayoutShell } from "@/components/settings/settings-layout-shell";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayoutShell>{children}</SettingsLayoutShell>;
}
