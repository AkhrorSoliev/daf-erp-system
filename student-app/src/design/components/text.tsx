import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '@/lib/cn';

export type TextVariant =
  | 'display'
  | 'heading'
  | 'title'
  | 'h3'
  | 'body'
  | 'bodyStrong'
  | 'muted'
  | 'label'
  | 'caps'
  | 'num';

// Display (Baloo 2) for headings + numbers; Nunito for everything readable.
// Colors are semantic (theme-aware via CSS vars).
const variants: Record<TextVariant, string> = {
  display: 'font-displayx text-[34px] leading-[37px] tracking-tight text-fg',
  heading: 'font-displayx text-[27px] leading-[30px] tracking-tight text-fg',
  title: 'font-displayx text-[21px] leading-[26px] text-fg',
  h3: 'font-display text-[18px] leading-[23px] text-fg',
  body: 'font-body text-[16px] leading-[24px] text-fg-body',
  bodyStrong: 'font-bodymd text-[16px] leading-[24px] text-fg',
  muted: 'font-body text-[14px] leading-[20px] text-fg-muted',
  label: 'font-bodymd text-[14px] leading-[19px] text-fg',
  caps: 'font-bodyx text-[11px] leading-[15px] tracking-[1px] uppercase text-fg-faint',
  num: 'font-displayx text-fg',
};

export function Text({
  variant = 'body',
  className,
  ...props
}: TextProps & { variant?: TextVariant }) {
  return <RNText className={cn(variants[variant], className)} {...props} />;
}
