"use client";

interface SettingsPageHeaderProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function SettingsPageHeader({
  title,
  description,
  action,
}: SettingsPageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
