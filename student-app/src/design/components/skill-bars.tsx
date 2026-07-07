import { View } from 'react-native';
import { MotiView } from 'moti';
import { cn } from '@/lib/cn';
import { inset } from '@/design/shadows';
import { EASE } from './motion';
import { Text } from './text';

export type Skill = { label: string; progress: number; color: string };

/**
 * Row of vertical skill gauges (Wortschatz / Schreiben / Lesen / Hören / Grammatik).
 * Each is a sunken well with a bottom-anchored colored fill that grows on mount.
 * `progress` is 0–100. Data-agnostic — feed it real values when the skills backend lands.
 */
export function SkillBars({ skills, className }: { skills: Skill[]; className?: string }) {
  return (
    <View className={cn('flex-row justify-between', className)}>
      {skills.map((s, i) => {
        const pct = Math.max(0, Math.min(100, s.progress));
        return (
          <View key={s.label} className="flex-1 items-center gap-2">
            <Text variant="num" className="text-[15px]">
              {pct}%
            </Text>
            <View
              className="w-8 justify-end overflow-hidden rounded-pill bg-sunk"
              style={{ height: 104, boxShadow: inset.soft }}
            >
              <MotiView
                from={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: 'timing', duration: 650, easing: EASE, delay: i * 80 }}
                style={{
                  height: `${pct}%`,
                  backgroundColor: s.color,
                  borderRadius: 999,
                  transformOrigin: '50% 100%',
                }}
              />
            </View>
            <Text numberOfLines={1} className="font-bodymd text-[10px] text-fg-muted">
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
