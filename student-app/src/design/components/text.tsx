import { Text as RNText, type TextProps } from 'react-native';
import { cn } from '@/lib/cn';

export type TextVariant = 'heading' | 'title' | 'body' | 'muted' | 'label';

const variants: Record<TextVariant, string> = {
  heading: 'text-2xl font-bold text-fg',
  title: 'text-lg font-semibold text-fg',
  body: 'text-base text-fg',
  muted: 'text-sm text-fg-muted',
  label: 'text-sm font-medium text-fg',
};

export function Text({
  variant = 'body',
  className,
  ...props
}: TextProps & { variant?: TextVariant }) {
  return <RNText className={cn(variants[variant], className)} {...props} />;
}
