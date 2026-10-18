import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FadeIn } from '@/components/fade-in';
import { Screen } from '@/components/screen';
import { Stat } from '@/components/stat';
import { Surface } from '@/components/surface';
import { spacing } from '@/theme';

/** Dashboard tab: agent-built widgets (docs/ARCHITECTURE.md §7). Placeholder until M5. */
export function Dashboard() {
  return (
    <Screen title="看板" subtitle="Dashboard">
      <FadeIn index={0}>
        <Surface style={styles.hero}>
          <Stat label="校园卡余额" icon="card" value={128.4} prefix="¥" size="numberXL" delta="-¥23.50 今日" deltaTone="down" />
        </Surface>
      </FadeIn>
      <View style={styles.grid}>
        <FadeIn index={1} style={styles.cell}>
          <Surface>
            <Stat label="网费余额" icon="wifi" value={36} prefix="¥" decimals={0} caption="本月已用 41.2 GB" />
          </Surface>
        </FadeIn>
        <FadeIn index={2} style={styles.cell}>
          <Surface>
            <Stat label="今日课程" icon="book" value={3} decimals={0} suffix=" 节" caption="下一节 14:00" />
          </Surface>
        </FadeIn>
      </View>
      <FadeIn index={3}>
        <EmptyState
          icon="sparkles"
          title="让 AI 帮你搭建看板"
          message="在对话里说「把校园卡余额和网费放到看板上」，它会生成并持续更新。"
          action={<Button title="去对话" icon="chat" variant="secondary" size="sm" />}
        />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl },
  grid: { flexDirection: 'row', gap: spacing.md },
  cell: { flex: 1 },
});
