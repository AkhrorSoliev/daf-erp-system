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
    <div className="mb-4 sm:mb-6 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base sm:text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
