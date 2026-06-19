import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { tokens } from '@/design/tokens';
import { shadow } from '@/design/shadows';
import { Text } from './text';

/** White pill with a filled icon + a chunky Baloo number — XP/streak/coin style stat. */
export function StatChip({
  icon,
  value,
  color = tokens.color.amber,
  className,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  color?: string;
  className?: string;
}) {
  return (
    <View
      className={cn('h-10 flex-row items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5', className)}
      style={{ boxShadow: shadow.sm }}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text variant="num" className="text-[17px]">
        {value}
      </Text>
    </View>
  );
}
